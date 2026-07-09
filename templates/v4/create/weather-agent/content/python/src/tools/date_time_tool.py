from datetime import datetime
from langchain_core.tools import tool


@tool
def get_date() -> str:
    """
    A function tool that returns the current date and time.
    """
    return datetime.now().isoformat()
