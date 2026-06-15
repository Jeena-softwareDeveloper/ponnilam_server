import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

export const login = async (req: Request, res: Response): Promise<any> => {
  try {
    const { username, password } = req.body;

    const envUser = process.env.ADMIN_USERNAME || 'admin';
    const envPass = process.env.ADMIN_PASSWORD || 'password123';

    if (username === envUser && password === envPass) {
      const token = jwt.sign(
        { id: 'env-admin', role: 'SUPER_ADMIN' },
        process.env.JWT_SECRET || 'fallback_secret',
        { expiresIn: '1d' }
      );
      
      return res.status(200).json({ message: 'Login successful', token });
    }

    return res.status(401).json({ error: 'Invalid credentials' });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
