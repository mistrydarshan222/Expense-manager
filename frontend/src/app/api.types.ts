export type AuthResponse = {
  message: string;
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
};

export type Category = {
  id: string;
  name: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type Expense = {
  id: string;
  title: string;
  categoryId: string | null;
  userId: string;
  merchantName: string | null;
  expenseDate: string;
  finalAmount: string;
  total: string | null;
  notes: string | null;
  paymentMethod: string | null;
  category?: Category | null;
  createdAt: string;
  updatedAt: string;
};
