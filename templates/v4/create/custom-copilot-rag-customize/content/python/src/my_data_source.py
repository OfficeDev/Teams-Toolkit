import os
from dataclasses import dataclass
@dataclass
class Result:
    output: str

class MyDataSource():
    """
    A data source that searches through a local directory of files for a given query.
    """

    def __init__(self,):
        """
        Creates a new instance of the LocalDataSource instance.
        Initializes the data source.
        """        
        filePath = os.path.join(os.path.dirname(__file__), 'data')
        files = os.listdir(filePath)
        self._data = []
        for file in files:
            with open(os.path.join(filePath, file), 'r') as f:
                content = f.read()
                self._data.append({
                    'filename': file,
                    'content': content
                })
        

    def render_data(self, query):
        """
        Renders the data source as a string of text.
        The returned output should be a string of text that will be injected into the prompt at render time.
        """
        if not query:
            return Result('', 0, False)
        
        matched_files = []
        
        # Text search
        for data_item in self._data:
            if query in data_item['content']:
                matched_files.append(data_item)
        
        # Key word search
        if 'history' in query.lower() or 'company' in query.lower():
            for item in self._data:
                if 'Overview' in item['filename']:
                    matched_files.append(item)
                    break
        if 'perksplus' in query.lower() or 'program' in query.lower():
            for item in self._data:
                if 'PerksPlus' in item['filename']:
                    matched_files.append(item)
                    break
        if 'northwind' in query.lower() or 'health' in query.lower() or 'plan' in query.lower():
            for item in self._data:
                if 'Plan' in item['filename']:
                    matched_files.append(item)
                    break
       
        return Result(self.formatDocuments(matched_files)) if matched_files else Result('')

    def formatDocuments(self, matched_files):
        """
        Formats the matched files as individual context tags
        """
        context_list = []
        for file_data in matched_files:
            context_tag = f'<context source="{file_data["filename"]}">{file_data["content"]}</context>'
            context_list.append(context_tag)
        return '\n'.join(context_list)