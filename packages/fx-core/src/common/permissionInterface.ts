export interface ResourcePermission {
  name: string;
  type: string;
  resourceId: string | undefined;
  roles: string[] | undefined;
}

export interface Collaborator {
  userPrincipalName: string;
  userObjectId: string;
  isAadOwner: boolean;
}

export interface AadOwner {
  id: string;
  displayName: string;
  userPrincipalName: string;
}

export interface TeamsAppAdmin {
  aadId: string;
  displayName: string;
  userPrincipalName: string;
}
