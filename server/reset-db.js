import bcrypt from 'bcryptjs';
import { store } from './store.js';
const users = [
    { id: 'u-admin', username: 'admin', email: 'admin@example.com', password_hash: await bcrypt.hash('Admin123!', 10), role: 'admin', created_at: new Date().toISOString() },
    { id: 'u-student', username: 'student', email: 'student@example.com', password_hash: await bcrypt.hash('User123!', 10), role: 'user', created_at: new Date().toISOString() }
];
store.writeDb({ users, documents: [] });
console.log('Zresetowano dane etapu 3.');
