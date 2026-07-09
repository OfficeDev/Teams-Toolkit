{
    "$schema": "https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json",
    "id": "c1b06178-4084-4a0e-8f1e-7acddec19930",
    "manifestVersion": "devPreview",
    "version": "1.0.0",
    "name": {
        "short": "{{appName}}",
        "full": "Full name for {{appName}}"
    },
    "description": {
        "short": "A template to get started.",
        "full": "This is the template to get started."
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
                    "name": "MailboxItem.Read.User",
                    "type": "Delegated"
                },
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
                "scopes": [
                    "mail",
                    "workbook",
                    "document",
                    "presentation"
                ]
            },
            "runtimes": [
                {
                    "requirements": {
                        "capabilities": [
                            {
                                "name": "Mailbox",
                                "minVersion": "1.3"
                            }
                        ]
                    },
                    "id": "TaskPaneRuntimeMail",
                    "type": "general",
                    "code": {
                        "page": "https://localhost:3000/taskpane.html"
                    },
                    "lifetime": "short",
                    "actions": [
                        {
                            "id": "TaskPaneRuntimeShowMail",
                            "type": "openPage",
                            "pinnable": false,
                            "view": "dashboard"
                        }
                    ]
                },
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
                    "requirements": {
                        "capabilities": [
                            {
                                "name": "AddinCommands",
                                "minVersion": "1.1"
                            }
                        ]
                    },
                    "id": "CommandsRuntime",
                    "type": "general",
                    "code": {
                        "page": "https://localhost:3000/commands.html",
                        "script": "https://localhost:3000/commands.js"
                    },
                    "lifetime": "short",
                    "actions": [
                        {
                            "id": "action",
                            "type": "executeFunction"
                        }
                    ]
                }
            ],
            "ribbons": [
                {
                    "requirements": {
                        "capabilities": [
                            {
                                "name": "Mailbox",
                                "minVersion": "1.3"
                            }
                        ]
                    },
                    "contexts": [
                        "mailRead"
                    ],
                    "tabs": [
                        {
                            "builtInTabId": "TabDefault",
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
                                            "actionId": "TaskPaneRuntimeShowMail"
                                        },
                                        {
                                            "id": "ActionButton",
                                            "type": "button",
                                            "label": "Perform an action",
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
                                                "title": "Perform an action",
                                                "description": "Perform an action when clicked."
                                            },
                                            "actionId": "action"
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                },
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
                                            "actionId": "TaskPaneRuntimeShow"
                                        },
                                        {
                                            "id": "ActionButton",
                                            "type": "button",
                                            "label": "Perform an action",
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
                                                "title": "Perform an action",
                                                "description": "Perform an action when clicked."
                                            },
                                            "actionId": "action"
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
