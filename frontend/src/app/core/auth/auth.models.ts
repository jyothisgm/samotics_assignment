export interface UserInfo {
  id: number;
  username: string;
  is_admin: boolean;
}

export interface AuthResponse {
  access_token: string;
  user: UserInfo;
}
