import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { User } from './models.js';

const SECRET_KEY = process.env.SECRET_KEY || 'your-secret-key-change-me';

export const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

export const verifyPassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

export const createToken = (user) => {
    return jwt.sign(
        { sub: user.username, role: user.role, id: user.id },
        SECRET_KEY,
        { expiresIn: '24h' }
    );
};

export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ detail: "Not authenticated" });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(401).json({ detail: "Invalid token" });
        req.user = user;
        next();
    });
};
