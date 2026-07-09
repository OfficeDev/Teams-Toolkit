import os

async def get_doc_data(embeddings, model):
    with open(f'{os.getcwd()}/src/indexers/data/Contoso_Electronics_PerkPlus_Program.md', 'r') as file:
        raw_description1 = file.read()
    doc1 = {
        "docId": "1",
        "docTitle": "Contoso_Electronics_PerkPlus_Program",
        "description": raw_description1,
        "descriptionVector": get_embedding_vector(raw_description1, embeddings=embeddings, model=model),
    }
    
    with open(f'{os.getcwd()}/src/indexers/data/Contoso_Electronics_Company_Overview.md', 'r') as file:
        raw_description2 = file.read()
    doc2 = {
        "docId": "2",
        "docTitle": "Contoso_Electronics_Company_Overview",
        "description": raw_description2,
        "descriptionVector": get_embedding_vector(raw_description2, embeddings=embeddings, model=model),
    }
    
    with open(f'{os.getcwd()}/src/indexers/data/Contoso_Electronics_Plan_Benefits.md', 'r') as file:
        raw_description3 = file.read()
    doc3 = {
        "docId": "3",
        "docTitle": "Contoso_Electronics_Plan_Benefits",
        "description": raw_description3,
        "descriptionVector": get_embedding_vector(raw_description3, embeddings=embeddings, model=model),
    }

    return [doc1, doc2, doc3]


def get_embedding_vector(text: str, embeddings, model):
    try:
        response = embeddings.embeddings.create(
            input=text,
            model=model
        )
        return response.data[0].embedding
    except Exception as e:
        raise Exception(f"Failed to generate embeddings for description: <{text[:200]+'...'}>\n\nError: {str(e)}")