import random
from langchain_core.tools import tool
from pydantic import BaseModel


class Weather(BaseModel):
    city: str
    temperature: str
    conditions: str
    date: str


@tool
def get_weather(city: str, date: str) -> Weather:
    """
    A function tool that returns weather information for a given city and date.
    """
    print("[debug] get_weather called")
    temperature = random.randint(8, 21)
    return Weather(
        city=city,
        temperature=f"{temperature}C",
        conditions="Sunny with wind.",
        date=date,
    )
