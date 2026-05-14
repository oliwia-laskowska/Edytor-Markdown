import jwt from 'jsonwebtoken';

export function auth(req, res, next) {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;

    if (!token) {
        return res.status(401).json({
            message: 'Brak tokenu'
        });
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
        next();
    } catch {
        return res.status(401).json({
            message: 'Nieprawidlowy token'
        });
    }
}

export function signUser(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.role
        },
        process.env.JWT_SECRET || 'dev-secret',
        {
            expiresIn: '8h'
        }
    );
}