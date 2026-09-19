import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || '';

// Generate or retrieve a Session ID so each browser gets its own graph + vector store
const getSessionId = () => {
    const fresh = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36));
    try {
        let sid = localStorage.getItem('cognigraph-session-id');
        if (!sid) {
            sid = fresh();
            localStorage.setItem('cognigraph-session-id', sid);
        }
        return sid;
    } catch {
        return fresh();
    }
};

export const api = axios.create({
    baseURL: API_URL,
    headers: { 'X-Session-ID': getSessionId() },
});
