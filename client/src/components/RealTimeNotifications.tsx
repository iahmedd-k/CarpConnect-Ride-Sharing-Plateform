import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'sonner';
import { Bell, CheckCircle, XCircle } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

const SOCKET_URL = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api', '') : 'http://localhost:5000';
const TOAST_DURATION_MS = 3000;

const RealTimeNotifications = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem('carpconnect_token');
        if (!token) return;

        let socket: ReturnType<typeof io> | null = null;
        let cancelled = false;

        const connectSocket = () => {
            socket = io(SOCKET_URL, {
                auth: { token },
                transports: ['polling', 'websocket'],
                timeout: 5000,
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1500,
            });

            socket.on('connect', () => {
                console.log('Real-time notifications socket connected');
            });

            socket.on('connect_error', (error) => {
                if (!cancelled) {
                    console.warn('Notifications socket unavailable:', error.message);
                }
            });

            const handleNotification = (notif: any) => {
                if (!notif) return;

                toast(notif.title || 'New Notification', {
                    description: notif.body || notif.message,
                    icon: getIcon(notif.type),
                    duration: TOAST_DURATION_MS,
                    action: notif.link ? {
                        label: 'View',
                        onClick: () => navigate(notif.link)
                    } : undefined,
                });
            };

            socket.on('notification', handleNotification);
            socket.on('newNotification', handleNotification);

            socket.on('rideStarted', () => {
                toast.success("Ride Started", {
                    description: "The driver has started the journey. Track live location now.",
                    duration: TOAST_DURATION_MS,
                    action: { label: "Track", onClick: () => navigate('/driver-dashboard?tab=live') }
                });
            });

            socket.on('rideCompleted', () => {
                toast.success("Ride Completed", {
                    description: "The journey has ended successfully. Hope you had a great ride!",
                    duration: TOAST_DURATION_MS,
                });
            });

            socket.on('passengerPickedUp', () => {
                toast.info("Passenger Picked Up", {
                    description: "A co-rider has joined the ride.",
                    duration: TOAST_DURATION_MS,
                });
            });

            socket.on('passengerDroppedOff', () => {
                toast.info("Passenger Dropped Off", {
                    description: "A co-rider reached their destination.",
                    duration: TOAST_DURATION_MS,
                });
            });

            socket.on('pickupSuccess', (data: any) => {
                toast.success("You're In!", {
                    description: data.message || "Your pickup has been confirmed by the driver.",
                    duration: TOAST_DURATION_MS,
                });
            });

            socket.on('dropoffSuccess', (data: any) => {
                toast.success("Safe Arrival", {
                    description: data.message || "You have reached your destination.",
                    duration: TOAST_DURATION_MS,
                });
            });
        };

        connectSocket();

        return () => {
            cancelled = true;
            socket?.disconnect();
        };
    }, [navigate]);

    const getIcon = (type: string) => {
        switch (type) {
            case 'bookingConfirmed': return <CheckCircle className="w-5 h-5 text-emerald" />;
            case 'paymentSuccess': return <CheckCircle className="w-5 h-5 text-emerald" />;
            case 'bookingCancelled':
            case 'paymentFailed': return <XCircle className="w-5 h-5 text-red-500" />;
            case 'newMatch': return <Bell className="w-5 h-5 text-amber-500 shadow-glow-amber" />;
            default: return <Bell className="w-5 h-5 text-primary" />;
        }
    };

    return null; // This component just listens
};

export default RealTimeNotifications;
