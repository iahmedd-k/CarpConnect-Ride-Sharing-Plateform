import axios from 'axios';

// Get the backend URL from environment variables or default to local 5000
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

/**
 * Creates an Axios instance pre-configured to point to our CarpConnect backend.
 * Automatically attaches the JWT token (if present) to every request.
 */
const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // Needed if we decide to use cookies later
});

// Interceptor to inject Auth Token before every request
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('carpconnect_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Interceptor to handle global errors like Account Deactivation or Token Expired
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response) {
            const { status, data } = error.response;

            // If account is deactivated (403) or token is invalid/expired (401)
            if (status === 401 || (status === 403 && data.message === 'Account is deactivated.')) {
                console.warn("Auth error or account deactivated. Logging out...");
                localStorage.removeItem('carpconnect_token');
                localStorage.removeItem('carpconnect_user');

                // Only redirect if not already on login or landing
                if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
                    window.location.href = '/login?error=' + encodeURIComponent(data.message || 'Session expired');
                }
            }
        }
        return Promise.reject(error);
    }
);

export default api;

