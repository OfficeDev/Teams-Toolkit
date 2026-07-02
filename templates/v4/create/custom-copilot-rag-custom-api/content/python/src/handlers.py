import json
import os

from microsoft_teams.cards import AdaptiveCard

from lib.adaptive_card_renderer import AdaptiveCardRenderer
from lib.requests_openapi import OpenAPIClient


current_dir = os.path.dirname(os.path.abspath(__file__))
spec_path = os.path.join(current_dir, '../appPackage/apiSpecificationFile/{{OPENAPI_SPEC_PATH}}')
client = OpenAPIClient().load_spec_from_file(spec_path)

// Replace with function handler code