"""
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the MIT License.
"""

import asyncio
from pathlib import Path
from typing import Any

from microsoft_teams.apps import App

app = App()
app.tab("test", str(Path("Web/dist").resolve()))

if __name__ == "__main__":
    asyncio.run(app.start())