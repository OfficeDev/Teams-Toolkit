{
  "component": {
    "version": 1,
    "uiSurface": "browser",
    "hostSurface": "playground",
    "id": "validateMessageExtensionPlaygroundPython",
    "parameters": ["instanceSuffix"]
  },
  "steps": [
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_01_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 569,
        "y": 714
      },
      "description": "Click the \"+\" button next to the chat input box in the Microsoft 365 Agents Playground web application interface to open the Message Extension type menu.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [],
      "preconditions": [
        "dhash:569:714:16:5:098d4d0c4d4d0c4d",
        "dhash:569:714:96:5:0008120909330800",
        "dhash:569:714:0:10:4cd07b12808282c0"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension",
        "precondition_wait_timeout: 120"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_02_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 557,
        "y": 608
      },
      "description": "Click the \"Search Command\" option in the \"Select a type of Message Extension\" dropdown menu at the bottom center of the Microsoft 365 Agents Playground interface.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_01_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:557:608:16:5:469de698252589db",
        "dhash:557:608:96:5:04267006e1004448",
        "dhash:557:608:0:10:4cd07b02808288c0"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_03_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 489,
        "y": 258
      },
      "description": "Click the \"Specify Command ID or Parameter\" section header to expand it in the \"Search-Based Message Extension\" popup within the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_02_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:489:258:16:5:0400262c8eaa28ad",
        "dhash:489:258:96:5:98469b4829000000",
        "dhash:489:258:0:10:4cd07909909090c2"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_04_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 559,
        "y": 442
      },
      "description": "Click the \"Command ID\" input field in the \"Specify Command ID or Parameter\" section of the \"Search-Based Message Extension\" popup within the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_03_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:559:442:16:5:0000000000000000",
        "dhash:559:442:96:5:20a02060609458da",
        "dhash:559:442:0:10:4cd07909888890c2"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_05_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "searchQuery"
      },
      "description": "Type 'searchQuery' into the 'Command ID' input field in the \"Specify Command ID or Parameter\" dialog of the Search-Based Message Extension in the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_04_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:4cd07909888890c2"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_06_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 542,
        "y": 542
      },
      "description": "Click the \"Enter a search\" input field in the \"Specify Command ID or Parameter\" dialog within the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_05_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:542:542:16:5:65db64adad6d2592",
        "dhash:542:542:96:5:dcdc204ece300000",
        "dhash:542:542:0:10:4cd07909888890c2"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_07_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "test"
      },
      "description": "Type text: 'test' into the \"Parameter name\" input field within the \"Specify Command ID or Parameter\" dialog of the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_06_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:4cd07909888880c2"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_08_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 535,
        "y": 583
      },
      "description": "Click the first dropdown item labeled \"Item 1\" in the search results below the \"Parameter name\" input after entering \"test\" in the \"Specify Command ID or Parameter\" dialog of the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_07_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:535:583:16:5:0000000000000000",
        "dhash:535:583:96:5:000000002ad156a8",
        "dhash:535:583:0:10:4cd27909888a8aca"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_09_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 607,
        "y": 732
      },
      "description": "Click the red \"Send\" (paper plane) button next to the input box in the \"Item 1\" chat card at the bottom of the \"Microsoft 365 Agents Playground\" web application interface. This action submits the entered query or message.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_08_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:607:732:16:5:9ce23c87a9a9873c",
        "dhash:607:732:96:5:a2a2a292cecab60e",
        "dhash:607:732:0:10:4c4213435a4a4870"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_10_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 567,
        "y": 716
      },
      "description": "Click the \"+\" button in the message input box at the bottom of the Microsoft 365 Agents Playground chat interface to open the Message Extension type menu.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_09_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:567:716:16:5:a6a686a6a686a6a6",
        "dhash:567:716:96:5:00301b1d191b2000",
        "dhash:567:716:0:10:4c42310182828248"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_11_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 586,
        "y": 636
      },
      "description": "Click the \"Action Command\" option in the \"Select a type of Message Extension\" dropdown within the chat interface of the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_10_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:586:636:16:5:004a895532cd4555",
        "dhash:586:636:96:5:002626d22646b85a",
        "dhash:586:636:0:10:4c42310182828840"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_12_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "createCard"
      },
      "description": "Type 'createCard' into the \"Command ID\" input field within the \"Action-Based Message Extension\" dialog in the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_11_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:4d13f1e0fcd0c103"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_13_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 361,
        "y": 507
      },
      "description": "Click the radio button labeled \"Static list of parameters\" in the \"Select how to create your dialog\" section of the \"Action-Based Message Extension\" dialog in the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_12_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:361:507:16:5:22006225adad6900",
        "dhash:361:507:96:5:d0cc0043332c2400",
        "dhash:361:507:0:10:4d13f1e0fcd0c103"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_14_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 725,
        "y": 726
      },
      "description": "Click the \"Create\" button at the bottom-right of the dialog in the Microsoft 365 Agents Playground web application, confirming the action to submit the static list of parameters for the \"createCard\" command.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_13_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:725:726:16:5:7069c6d6c2720972",
        "dhash:725:726:96:5:000023343c23d022",
        "dhash:725:726:0:10:50f8f9f1d8d8d8d0"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_15_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 357,
        "y": 331
      },
      "description": "Click inside the \"Title for the card\" input field within the \"Your Message Extension App\" dialog to focus and enable title entry.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_14_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:357:331:16:5:00000040004050d0",
        "dhash:357:331:96:5:0000004098b84000",
        "dhash:357:331:0:10:4d43f1e0f0c0e103"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_16_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "1"
      },
      "description": "Type the text '1' into the \"Card title\" input field in the \"Your Message Extension App\" pop-up dialog within the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_15_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:4d43f1e0f8c0e103"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_17_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 321,
        "y": 403
      },
      "description": "Click on the \"Subtitle\" input field within the \"Your Message Extension App\" dialog to focus and enter a subtitle for the card.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_16_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:321:403:16:5:000054461133eb69",
        "dhash:321:403:96:5:00c0c81454000200",
        "dhash:321:403:0:10:4d43f1e0f0c0e103"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_18_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "2"
      },
      "description": "Type text: '2' into the \"Card title\" input field in the \"Your Message Extension App\" dialog within the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_17_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:4d43f1e0f0c0e103"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_19_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 258,
        "y": 491
      },
      "description": "Click inside the \"Text\" input field labeled \"Text for the card\" in the \"Your Message Extension App\" dialog of the Microsoft 365 Agents Playground web interface.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_18_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:258:491:16:5:5214910000000000",
        "dhash:258:491:96:5:9c320b2530303030",
        "dhash:258:491:0:10:4d43f1c0f0c0e103"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_20_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "3"
      },
      "description": "Type text '3' into the 'Subtitle' input field of the 'Your Message Extension App' dialog in the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_19_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:4d43f1c0f0c0e103"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_21_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 260,
        "y": 573
      },
      "description": "Click the \"Submit\" button in the \"Your Message Extension App\" popup, located below the text input fields within the Microsoft 365 Agents Playground web application interface.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_20_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:260:573:16:5:126d8b36f8e929a9",
        "dhash:260:573:96:5:2010100d0f020000",
        "dhash:260:573:0:10:4d43f1c0e8c0e103"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_22_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 605,
        "y": 735
      },
      "description": "Click the send (paper airplane) button in the message compose box at the bottom of the Microsoft 365 Agents Playground chat interface to submit the current message.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_21_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:605:735:16:5:bcc7716e71c7bc67",
        "dhash:605:735:96:5:0202021a4e4ab244",
        "dhash:605:735:0:10:44c2723192c29280"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_23_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 567,
        "y": 720
      },
      "description": "Click the \"+\" (plus) button in the message compose box at the bottom of the Microsoft 365 Agents Playground chat interface to open the \"Select a type of Message Extension\" menu.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_22_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:567:720:16:5:8626268626060702",
        "dhash:567:720:96:5:0002010d0d120000",
        "dhash:567:720:0:10:4c523223d22c2c28"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_24_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 561,
        "y": 673
      },
      "description": "Click the \"Link Unfurling\" option in the \"Select a type of Message Extension\" popup menu within the chat interface of the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_23_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:561:673:16:5:ca5587d59595952a",
        "dhash:561:673:96:5:94c901a692490424",
        "dhash:561:673:0:10:4c523233c22c3a3a"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_25_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "type_text",
      "parameters": {
        "text": "https://botframework.com"
      },
      "description": "Type 'https://botframework.com' into the single-line input field within the \"Enter an URL\" dialog of the Microsoft 365 Agents Playground web application.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_24_{{text:instanceSuffix}}"
      ],
      "preconditions": ["dhash:512:384:0:20:40f8d8c0c8c8c0c0"],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_26_{{text:instanceSuffix}}",
      "agent": "interaction",
      "tool": "click",
      "parameters": {
        "button": "left",
        "x": 690,
        "y": 709
      },
      "description": "Click the \"Send to Conversation\" button in the \"Enter an URL\" popup dialog within the Microsoft 365 Agents Playground web application to submit the entered link. The button is highlighted with a blue background and white text at the bottom right of the dialog.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_25_{{text:instanceSuffix}}"
      ],
      "preconditions": [
        "dhash:690:709:16:5:d854648b42aa0000",
        "dhash:690:709:96:5:0050a11552000000",
        "dhash:690:709:0:10:40f8f8f0c8e8c0c0"
      ],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension"
      ]
    },
    {
      "step_id": "step_validateMessageExtensionPlaygroundPython_27_{{text:instanceSuffix}}",
      "agent": "assertion",
      "tool": "",
      "parameters": {},
      "description": "@assertion there's \"Unfurled Link\" exist.",
      "content_refs": [],
      "timeout": 30,
      "retry_count": 0,
      "continue_on_error": "false",
      "depends_on": [
        "step_validateMessageExtensionPlaygroundPython_26_{{text:instanceSuffix}}"
      ],
      "preconditions": [],
      "postconditions": [],
      "tags": [
        "component:browser",
        "host_surface:playground",
        "recording_language:python",
        "entry_state:chat-ready",
        "check:message-extension",
        "step_retry_timeout: 60"
      ]
    }
  ]
}
