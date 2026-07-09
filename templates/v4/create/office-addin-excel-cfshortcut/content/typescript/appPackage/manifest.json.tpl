{
    "$schema": "https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json",
    "id": "c1b06178-4084-4a0e-8f1e-7acddec18830",
    "manifestVersion": "devPreview",
    "version": "1.0.0",
    "name": {
        "short": "{{appName}}",
        "full": "Full name for {{appName}}"
    },
    "description": {
        "short": "Custom Functions and Shortcuts test",
        "full": "This is RichAPI extension with Custom Functions and Shortcuts."
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
    "extensions": [
        {
            "requirements": {
                "scopes": ["workbook"]
            },
            "runtimes": [
                {
                    "requirements": {
                        "capabilities": [{ "name": "SharedRuntime", "minVersion": "1.1" }]
                    },
                    "id": "taskpane",
                    "type": "general",
                    "code": {
                        "page": "https://localhost:3000/taskpane.html"
                    },
                    "lifetime": "long",
                    "actions": [
                        {
                            "id": "RIBBONTASKPANESHOW",
                            "type": "openPage",
                            "pinnable": false,
                            "view": "dashboard"
                        },
                        {
                            "id": "SHOWTASKPANE",
                            "type": "executeFunction",
                            "displayName": "Open"
                        },
                        {
                            "id": "HIDETASKPANE",
                            "type": "executeFunction",
                            "displayName": "Close"
                        }
                    ],
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
                            }
                        ],
                        "namespace": {
                            "id": "CFNAMESPACE",
                            "name": "CFNAMESPACE"
                        },
                        "allowCustomDataForDataTypeAny": false
                    }
                }
            ],
            "keyboardShortcuts": [
                {
                    "requirements": {
                        "capabilities": [
                            {
                                "name": "SharedRuntime",
                                "minVersion": "1.1"
                            }
                        ]
                    },
                    "shortcuts": [
                        {
                            "key": {
                                "default": "Ctrl+Alt+1",
                                "mac": "Command+Shift+1",
                                "web": "Ctrl+Alt+1"
                            },
                            "actionId": "SHOWTASKPANE"
                        },
                        {
                            "key": {
                                "default": "Ctrl+Alt+2",
                                "mac": "Command+Shift+2",
                                "web": "Ctrl+Alt+2"
                            },
                            "actionId": "HIDETASKPANE"
                        }
                    ]
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
                                    "id": "msgReadGroup",
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
                                            "id": "msgReadOpenPaneButton",
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
                                            "actionId": "RIBBONTASKPANESHOW"
                                        },
                                        {
                                            "id": "CloseButton",
                                            "type": "button",
                                            "label": "Close Taskpane",
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
                                                "title": "Close Taskpane",
                                                "description": "Close Taskpane when clicked."
                                            },
                                            "actionId": "HIDETASKPANE"
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
