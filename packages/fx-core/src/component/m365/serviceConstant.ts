// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
export interface MOS3Api {
  key: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: RegExp;
}

export const MOS3ApiDefinitions: any = {
  GetConfigEnv: {
    key: "get_config_env",
    method: "GET",
    path: /^\/config\/v1\/environment$/,
  },
  PostPackageAddin: {
    key: "post_package_addin",
    method: "POST",
    path: /^\/dev\/v1\/users\/packages\/addins$/,
  },
  GetDevStatus: {
    key: "get_dev_status",
    method: "GET",
    path: /^\/dev\/v1\/users\/packages\/status\/[^\/]+/,
  },
  PostBuilderPackage: {
    key: "post_builder_package",
    method: "POST",
    path: /^\/builder\/v1\/users\/packages(\?|$)/,
  },
  GetBuilderStatus: {
    key: "get_builder_status",
    method: "GET",
    path: /^\/builder\/v1\/users\/packages\/status\/[^\/]+/,
  },
  GetShareInfo: {
    key: "get_share_info",
    method: "GET",
    path: /^\/marketplace\/v1\/users\/titles\/[^\/]+\/sharingInfo$/,
  },
  PostCatalogLaunchInfo: {
    key: "post_catalog_launch_info",
    method: "POST",
    path: /^\/catalog\/v1\/users\/titles\/launchInfo/,
  },
  DeleteCatalogAcquisitions: {
    key: "delete_catalog_acquisitions",
    method: "DELETE",
    path: /^\/catalog\/v1\/users\/acquisitions\/[^\/]+/,
  },
  GetLaunchInfoByTitle: {
    key: "get_launch_info_by_title",
    method: "GET",
    path: /^\/catalog\/v1\/users\/titles\/[^\/]+\/launchInfo/,
  },
  GetCatalogUITypes: {
    key: "get_catalog_ui_types",
    method: "GET",
    path: /^\/catalog\/v1\/users\/uitypes$/,
  },
  PutTitleOwners: {
    key: "put_title_owners",
    method: "PUT",
    path: /^\/builder\/v1\/users\/titles\/[^\/]+\/owners/,
  },
  GetMarketplaceTitlePreview: {
    key: "get_marketplace_title_preview",
    method: "GET",
    path: /^\/marketplace\/v1\/users\/titles\/[^\/]+\/preview/,
  },
  PostBuilderTitleAllowed: {
    key: "builder_share_title_with_users",
    method: "POST",
    path: /^\/builder\/v1\/users\/titles\/[^\/]+\/allowed\?idType=(TitleId|AppId)/,
  },
  GetBuilderTitleAllowed: {
    key: "builder_get_title_allowed",
    method: "GET",
    path: /^\/builder\/v1\/users\/titles\/[^\/]+\/allowed\?idType=TitleId/,
  },
  DeleteBuilderTitleAllowed: {
    key: "builder_delete_title_allowed",
    method: "DELETE",
    path: /^\/builder\/v1\/users\/titles\/[^\/]+\/allowed\?idType=TitleId/,
  },
  DeleteBuilderTitle: {
    key: "builder_delete_title",
    method: "DELETE",
    path: /^\/builder\/v1\/users\/titles\/[^\/]+$/,
  },
};
