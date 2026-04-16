export interface Medicine {
  id: string;
  name: string;
  manufacturer: string;
  dosage: string;
  effect?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
}
