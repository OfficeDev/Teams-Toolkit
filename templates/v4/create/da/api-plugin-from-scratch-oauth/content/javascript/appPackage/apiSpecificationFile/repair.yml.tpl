openapi: 3.0.0
info:
  title: Repair Service
  description: A simple service to manage repairs
  version: 1.0.0
servers:
  - url: ${{OPENAPI_SERVER_URL}}/api
    description: The repair api server
components:
  securitySchemes:
{{#MicrosoftEntra}}
    aadAuthCode:
      type: oauth2
      description: AAD configuration for the repair service
      flows:
        authorizationCode:
          authorizationUrl: https://login.microsoftonline.com/${{AAD_APP_TENANT_ID}}/oauth2/v2.0/authorize
          tokenUrl: https://login.microsoftonline.com/${{AAD_APP_TENANT_ID}}/oauth2/v2.0/token
          scopes:
            api://${{OPENAPI_SERVER_DOMAIN}}/${{AAD_APP_CLIENT_ID}}/repairs_read: Read repair records
{{/MicrosoftEntra}}
{{^MicrosoftEntra}}
    oAuth2AuthCode:
      type: oauth2
      description: OAuth configuration for the repair service
      flows:
        authorizationCode:
          authorizationUrl: https://login.microsoftonline.com/${{AAD_APP_TENANT_ID}}/oauth2/v2.0/authorize
          tokenUrl: https://login.microsoftonline.com/${{AAD_APP_TENANT_ID}}/oauth2/v2.0/token
          scopes:
            api://${{AAD_APP_CLIENT_ID}}/repairs_read: Read repair records
{{/MicrosoftEntra}}
paths:
  /repairs:
    get:
      operationId: listRepairs
      summary: List all repairs
      description: Returns a list of repairs with their details and images
      security:
{{#MicrosoftEntra}}
        - aadAuthCode:
          - api://${{OPENAPI_SERVER_DOMAIN}}/${{AAD_APP_CLIENT_ID}}/repairs_read
{{/MicrosoftEntra}}
{{^MicrosoftEntra}}
        - oAuth2AuthCode:
          - api://${{AAD_APP_CLIENT_ID}}/repairs_read
{{/MicrosoftEntra}}
      parameters:
        - name: assignedTo
          in: query
          description: Filter repairs by who they're assigned to
          schema:
            type: string
          required: false
      responses:
        '200':
          description: A list of repairs
          content:
            application/json:
              schema:
                type: object
                properties:
                  results:
                    type: array
                    items:
                      type: object
                      properties:
                        id:
                          type: string
                          description: The unique identifier of the repair
                        title:
                          type: string
                          description: The short summary of the repair
                        description:
                          type: string
                          description: The detailed description of the repair
                        assignedTo:
                          type: string
                          description: The user who is responsible for the repair
                        date:
                          type: string
                          format: date-time
                          description: The date and time when the repair is scheduled or completed
                        image:
                          type: string
                          format: uri
                          description: The URL of the image of the item to be repaired or the repair process