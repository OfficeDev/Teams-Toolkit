from enum import Enum
import json
import re
import copy
import traceback

class ElementType(Enum):
    TEXTBLOCK = "TextBlock"
    CONTAINER = "Container"
    IMAGE = "Image"

class AdaptiveCardRenderer:
    def __init__(self, template_str: str):
        self.template_str = template_str

    def render(self, data_str: str):
        try:
            data = json.loads(data_str)
            self.root = data

            simplified_template = self.__remove_space_in_expression(self.template_str)
            template = json.loads(simplified_template)

            card_body = template["body"]
            result = self.__render_adaptive_card_body(card_body, data)
            template["body"] = result

            return json.dumps(template, indent=2)
        except Exception as e:
            print(f"An error occurred while rendering adaptive card: {traceback.format_exc()}")
            return self.template_str

    def __render_adaptive_card_body(self, template, data):
        result = []

        if isinstance(data, list):
            for item in data:
                result.append(self.__render_adaptive_card_body(template, item))
            return result
        else:
            for element in template:
                cloned_element = copy.deepcopy(element)

                if cloned_element["type"] == ElementType.TEXTBLOCK.value:
                    text = cloned_element["text"]
                    text = self.__evaluate_if_expression(text, data)
                    text = self.__evaluate_jsonStringify_expression(text, data)
                    keys = self.__get_template_keys(text)
                    for key in keys:
                        value = self.__evaluate_variable_value(key, data)
                        if value is None:
                            continue
                        str_value = str(value)
                        text = text.replace(f"${{{key}}}", str_value)
                    cloned_element["text"] = text
                    result.append(cloned_element)
                elif cloned_element["type"] ==  ElementType.CONTAINER.value:
                    array_data = cloned_element.get("$data", None)

                    if not array_data:
                        result.append(cloned_element)
                        continue

                    data_key = self.__get_template_keys(array_data)[0]
                    items_array =  self.__render_adaptive_card_body(cloned_element["items"], data[data_key])
                    for item in items_array:
                        cloned_container = copy.deepcopy(cloned_element)
                        cloned_container["items"] = item
                        del cloned_container["$data"]
                        result.append(cloned_container)
                elif cloned_element["type"] == ElementType.IMAGE.value:
                    when = cloned_element.get("$when", None)
                    visible = True
                    if when:
                        visible = self.__evaluate_boolean_expression(when, data)

                    if visible:
                        image_url = cloned_element["url"]
                        keys = self.__get_template_keys(image_url)
                        for key in keys:
                            str_value = str(self.__get_nested_property_value(data, key, default=key))
                            image_url = image_url.replace(f"${{{key}}}", str_value)
                        cloned_element["url"] = image_url
                        del cloned_element["$when"]
                        result.append(cloned_element)
        return result


    def __remove_space_in_expression(self, template_str):
        # removes whitespace outside of quoted strings in the template string.
        def replace_whitespace(match):
            pattern = r'(["\'].*?["\'])|(\s+)'

            def process_match(inner_match):
                # If the match is a quoted string, return it unchanged.
                if inner_match.group(1):
                    return inner_match.group(1)
                # Otherwise, it's whitespace outside quotes, so remove it.
                else:
                    return ''
            return re.sub(pattern, process_match, match.group(0))
        return re.sub(r'\$\{[^}]*\}', replace_whitespace, template_str)

    def __evaluate_boolean_expression(self, expression, data):
        # Only support expression like ${image!=null&&image!=''} in Image element
        match = re.match(r"\$\{(\w+)!=null&&\w+!=''\}", expression)
        if not match:
            return True

        variable = match.group(1)

        variable = self.__evaluate_variable_value(variable, data)

        return variable is not None and variable != ''

    def __evaluate_if_expression(self, input_str, data):
        # Only support expression like ${if(data,data,'value')} in TextBlock element
        pattern = r"\$\{if\(([^,]+),([^,]+),([^)]+)\)\}"

        def eval_match(match):
            condition_var, true_var, false_var = match.groups()
            condition_result = self.__evaluate_variable_value(condition_var, data)
            if condition_result:
                true_value = self.__evaluate_variable_value(true_var, data)
                return str(true_value)
            else:
                false_value = self.__evaluate_variable_value(false_var, data)
                return str(false_value)

        result_str = re.sub(pattern, eval_match, input_str)

        return result_str

    def __evaluate_jsonStringify_expression(self, expression, data):
        # Only support expression like ${jsonStringify(data)} in Image element
        pattern = r"\$\{jsonStringify\(([^\)]+)\)\}"

        def eval_match(match):
            value = match.groups()[0]
            return json.dumps(self.__get_nested_property_value(data, value))

        result_str = re.sub(pattern, eval_match, expression)
        return result_str

    def __is_quoted_str(self, value):
        return value[0] == value[-1] and value[0] in ("'", '"')

    def __evaluate_variable_value(self, variable, data, default=None):
        if self.__is_quoted_str(variable):
            return variable[1:-1]
        elif variable == "true":
            return True
        elif variable == "false":
            return False
        elif self.__is_array_index_access_variable(variable):
            array_index = int(variable[variable.index("[")+1:variable.index("]")])
            variable = variable[:variable.index("[")]
            return self.__get_nested_property_value(data, variable, default)[array_index]

        return self.__get_nested_property_value(data, variable, default)

    def __is_array_index_access_variable(self, variable):
        return bool(re.search(r'\[\d+\]$', variable))


    def __get_template_keys(self, text):
        pattern = r"\${(.*?)}"
        keys = re.findall(pattern, text)
        return keys

    def __get_nested_property_value(self, data, property_str, default=None):
        if property_str == "$data":
            return data

        keys = property_str.split('.')

        if keys[0] == "$root":
            keys = keys[1:]
            data = self.root

        try:
            for key in keys:
                data = data[key]
            return data
        except KeyError:
            return default
