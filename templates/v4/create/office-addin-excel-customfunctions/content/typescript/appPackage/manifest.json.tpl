{
    "$schema": "https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json",
    "id": "c1b06178-4084-4a0e-8f1e-7acddec18831",
    "manifestVersion": "devPreview",
    "version": "1.0.0",
    "name": {
        "short": "{{appName}}",
        "full": "Full name for {{appName}}"
    },
    "description": {
        "short": "Excel custom functions using a JavaScript-only runtime.",
        "full": "This add-in defines Excel custom functions that run in a JavaScript-only runtime."
    },
    "developer": {
        "name": "Contoso",
        "websiteUrl": "https://www.contoso.com",
        "privacyUrl": "https://www.contoso.com/privacy",
        "termsOfUseUrl": "https://www.contoso.com/servicesagreement"
    },
    "icons": {
        "outline": "assets/outline.png",
        "color": "assets/color.png"
    },
    "accentColor": "#230201",
    "localizationInfo": {
        "defaultLanguageTag": "en-us",
        "additionalLanguages": []
    },
    "authorization": {
        "permissions": {
            "resourceSpecific": [
                {
                    "name": "Document.ReadWrite.User",
                    "type": "Delegated"
                }
            ]
        }
    },
    "validDomains": [
        "contoso.com"
    ],
    "extensions": [
        {
            "requirements": {
                "scopes": ["workbook"],
                "capabilities": [
                    { "name": "CustomFunctionsRuntime", "minVersion": "1.1" }
                ]
            },
            "runtimes": [
                {
                    "id": "TaskPaneRuntime",
                    "type": "general",
                    "code": {
                        "page": "https://localhost:3000/taskpane.html"
                    },
                    "lifetime": "short",
                    "actions": [
                        {
                            "id": "TaskPaneRuntimeShow",
                            "type": "openPage",
                            "pinnable": false,
                            "view": "dashboard"
                        }
                    ]
                },
                {
                    "id": "FunctionsRuntime",
                    "type": "general",
                    "code": {
                        "page": "https://localhost:3000/functions.html",
                        "script": "https://localhost:3000/functions.js"
                    },
                    "lifetime": "short",
                    "customFunctions": {
                        "functions": [
                            {
                                "id": "ADD",
                                "name": "ADD",
                                "description": "Adds two numbers.",
                                "parameters": [
                                    {
                                        "description": "First number",
                                        "name": "first",
                                        "type": "number",
                                        "dimensionality": "scalar"
                                    },
                                    {
                                        "description": "Second number",
                                        "name": "second",
                                        "type": "number",
                                        "dimensionality": "scalar"
                                    }
                                ],
                                "result": {
                                    "type": "number",
                                    "dimensionality": "scalar"
                                }
                            },
                            {
                                "description": "Displays the current time once a second.",
                                "id": "CLOCK",
                                "name": "CLOCK",
                                "parameters": [],
                                "stream": true,
                                "result": {
                                    "type": "string"
                                }
                            },
                            {
                                "description": "Increments a value once a second.",
                                "id": "INCREMENT",
                                "name": "INCREMENT",
                                "parameters": [
                                    {
                                        "description": "Amount to increment",
                                        "name": "incrementBy",
                                        "type": "number"
                                    }
                                ],
                                "stream": true,
                                "result": {
                                    "type": "number"
                                }
                            },
                            {
                                "description": "Logs a message to the console.",
                                "id": "LOG",
                                "name": "LOG",
                                "parameters": [
                                    {
                                        "description": "String to write.",
                                        "name": "message",
                                        "type": "string"
                                    }
                                ],
                                "result": {
                                    "type": "string"
                                }
                            }
                        ],
                        "namespace": {
                            "id": "CONTOSO",
                            "name": "CONTOSO"
                        },
                        "allowCustomDataForDataTypeAny": false
                    }
                }
            ],
            "ribbons": [
                {
                    "contexts": [
                        "default"
                    ],
                    "tabs": [
                        {
                            "builtInTabId": "TabHome",
                            "groups": [
                                {
                                    "id": "CommandsGroup",
                                    "label": "Contoso Add-in",
                                    "icons": [
                                        {
                                            "size": 16,
                                            "url": "https://localhost:3000/assets/icon-16.png"
                                        },
                                        {
                                            "size": 32,
                                            "url": "https://localhost:3000/assets/icon-32.png"
                                        },
                                        {
                                            "size": 80,
                                            "url": "https://localhost:3000/assets/icon-80.png"
                                        }
                                    ],
                                    "controls": [
                                        {
                                            "id": "TaskpaneButton",
                                            "type": "button",
                                            "label": "Show Taskpane",
                                            "icons": [
                                                {
                                                    "size": 16,
                                                    "url": "https://localhost:3000/assets/icon-16.png"
                                                },
                                                {
                                                    "size": 32,
                                                    "url": "https://localhost:3000/assets/icon-32.png"
                                                },
                                                {
                                                    "size": 80,
                                                    "url": "https://localhost:3000/assets/icon-80.png"
                                                }
                                            ],
                                            "supertip": {
                                                "title": "Show Taskpane",
                                                "description": "Opens a pane displaying all available properties."
                                            },
                                            "actionId": "TaskPaneRuntimeShow"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        }
    ]
}
