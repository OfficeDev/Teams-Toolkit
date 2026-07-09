# This code is coming from https://github.com/wy-z/requests-openapi

import copy
import functools
import logging
import pprint
import typing

import jsonref
import openapi_pydantic as openapi
import requests
import yaml

try:
    from yaml import CLoader as yaml_loader
except ImportError:
    from yaml import Loader as yaml_loader

import abc
import requests


class Requestor(abc.ABC):
    @abc.abstractmethod
    def request(self, method, url, params={}, headers={}, cookies={}, **kwargs):
        pass

Requestor.register(requests.Session)


log = logging.getLogger(__name__)

OPENAPI_KEY_PATHS = "paths"
OPENAPI_KEY_PARAMETERS = "parameters"


class Server(openapi.Server):
    def get_url(self):
        if self.variables:
            return self.url.format(**self.variables)
        return self.url

    def set_url(self, url: str, strip_slash=True):
        if strip_slash:
            url = url.rstrip("/")
        self.url = url

    @classmethod
    def from_openapi_server(cls, s: openapi.Server):
        obj = copy.copy(s)
        obj.__class__ = cls
        return obj


class Operation(object):
    INTERNAL_PARAM_PREFIX = "_"

    path: str
    method: str
    spec: openapi.Operation
    requestor: Requestor
    req_opts: dict[str, typing.Any]
    server: Server
    # https://swagger.io/specification/#path-item-object parameters
    parent_params: list[openapi.Parameter]

    def __init__(
        self,
        path: str,
        method: str,
        spec: openapi.Operation,
        *,
        requestor: Requestor,
        server: Server,
        req_opts={},
        parent_params: list[openapi.Parameter] = [],
    ):
        self.path = path
        self.method = method
        self.spec = spec
        self.requestor = requestor
        self.server = server
        self.req_opts = req_opts
        self.parent_params = parent_params

    @property
    def operation_id(self):
        return self.spec.operationId

    def gen_url(self, **kwargs):
        return self.server.get_url() + self.path.format(**kwargs)

    @functools.cache
    def _gen_call(self):
        def f(**kwargs):
            # collect api params
            path_params, params, headers, cookies = {}, {}, {}, {}
            for spec in (self.spec.parameters or []) + (self.parent_params or []):
                _in = spec.param_in
                name = spec.name
                # path param is required
                if name not in kwargs:
                    if _in == openapi.ParameterLocation.PATH:
                        raise ValueError(f"path param '{name}' is required")
                    continue
                # collect params
                if _in == openapi.ParameterLocation.PATH:
                    path_params[name] = kwargs.pop(name)
                elif _in == openapi.ParameterLocation.QUERY:
                    params[name] = kwargs.pop(name)
                elif _in == openapi.ParameterLocation.HEADER:
                    headers[name] = kwargs.pop(name)
                elif _in == openapi.ParameterLocation.COOKIE:
                    cookies[name] = kwargs.pop(name)
            # collect internal params
            for k in list(kwargs.keys()):
                if not k.startswith(self.INTERNAL_PARAM_PREFIX):
                    continue
                kwargs[k[len(self.INTERNAL_PARAM_PREFIX) :]] = kwargs.pop(k)
            kwargs.setdefault("params", {}).update(params)
            kwargs.setdefault("headers", {}).update(headers)
            kwargs.setdefault("cookies", {}).update(cookies)
            # set request params
            for k, v in self.req_opts.items():
                kwargs.setdefault(k, v)
            return self.requestor.request(
                self.method, self.gen_url(**path_params), **kwargs
            )

        return f

    def __call__(self, *args, **kwargs):
        return self._gen_call()(*args, **kwargs)

    def help(self):
        return pprint.pprint(self.spec.model_dump(), indent=2)

    def __repr__(self):
        return f"<{type(self).__name__}: [{self.method}] {self.path}>"


def load_spec_from_url(url):
    r = requests.get(url)
    r.raise_for_status()
    return yaml.load(r.text, Loader=yaml_loader)


def load_spec_from_file(file_path):
    with open(file_path) as f:
        spec_str = f.read()
    return yaml.load(spec_str, Loader=yaml_loader)


class OpenAPIClient:
    _requestor: Requestor
    _server: typing.Optional[Server]
    _operations: dict[str, typing.Any]
    _raw_spec: dict[str, typing.Any]
    _spec: openapi.OpenAPI

    req_opts: dict[str, typing.Any]

    def __init__(
        self,
        requestor: typing.Optional[Requestor] = None,
        server: typing.Optional[Server] = None,
        req_opts={},
    ):
        self._requestor = requestor or requests.Session()
        self._server = server
        self.req_opts = req_opts

    @property
    def operations(self):
        return self._operations

    @property
    def spec(self):
        return self._spec

    @property
    def requestor(self):
        return self._requestor

    def set_requestor(self, r: Requestor):
        if not isinstance(r, Requestor):
            raise ValueError("requestor should be an instance of Requestor")
        self._requestor = r
        self._collect_operations()

    @property
    def server(self):
        return self._server

    def set_server(self, s: Server):
        self._server = s
        self._collect_operations()

    def load_spec(self, raw_spec: typing.Dict):
        self._raw_spec = raw_spec
        self._spec = openapi.parse_obj(raw_spec)

        # collect server
        self.servers = [Server.from_openapi_server(s) for s in self.spec.servers]
        if not self.server and self.servers:
            self._server = self.servers[0]
        # collect operations
        self._collect_operations()

    PATH_ITEM_METHODS = [
        "get",
        "put",
        "post",
        "delete",
        "options",
        "head",
        "patch",
        "trace",
    ]

    @functools.cached_property
    def derefered_raw_spec(self) -> dict:
        return jsonref.replace_refs(self._raw_spec)

    def _check_derefer_params(
        self,
        params: list[typing.Union[openapi.Parameter, openapi.Reference]],
        derefered_params_spec: list[dict],
    ) -> list[openapi.Parameter]:
        refs = list(
            filter(
                lambda x: isinstance(x, openapi.Reference)
                or type(x).__name__ == "Reference",
                params,
            )
        )
        if not refs:
            return params
        return [openapi.Parameter(**d) for d in derefered_params_spec]

    def _collect_operations(self):
        if not self.server:
            raise ValueError("server is required, 'set_server' first")

        self._operations = {}
        for path, path_spec in (self.spec.paths or {}).items():
            for method in self.PATH_ITEM_METHODS:
                op_spec = getattr(path_spec, method, None)
                if not op_spec:
                    continue
                op_id = op_spec.operationId
                parent_params = self._check_derefer_params(
                    path_spec.parameters or [],
                    self.derefered_raw_spec.get(OPENAPI_KEY_PATHS, {})
                    .get(path, {})
                    .get(OPENAPI_KEY_PARAMETERS, []),
                )
                op_spec.parameters = self._check_derefer_params(
                    op_spec.parameters or [],
                    self.derefered_raw_spec.get(OPENAPI_KEY_PATHS, {})
                    .get(path, {})
                    .get(method, {})
                    .get(OPENAPI_KEY_PARAMETERS, []),
                )
                op = Operation(
                    path,
                    method,
                    op_spec,
                    requestor=self.requestor,
                    req_opts=self.req_opts,
                    server=self.server,
                    parent_params=parent_params,
                )
                if op_id not in self._operations:
                    self._operations[op_id] = op
                else:
                    log.warning(
                        f"multiple '{op_id}' found , operation ID should be unique"
                    )
                    v = self._operations[op_id]
                    if not isinstance(v, list):
                        self._operations[op_id] = [v]
                    self._operations[op_id].append(op)

    def load_spec_from_url(self, url):
        spec = load_spec_from_url(url)
        self.load_spec(spec)
        return self

    def load_spec_from_file(self, file_path):
        spec = load_spec_from_file(file_path)
        self.load_spec(spec)
        return self

    def __getattr__(self, op_name):
        if op_name in self._operations:
            return self._operations[op_name]
        raise AttributeError(f"'{self.__class__}' has no attribute '{op_name}'")