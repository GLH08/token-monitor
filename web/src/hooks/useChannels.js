import { useState, useEffect } from 'react';
import { fetchChannels } from '../api';

export const useChannels = () => {
    const [channels, setChannels] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        const loadChannels = async () => {
            setLoading(true);
            try {
                const result = await fetchChannels();
                if (isMounted && Array.isArray(result)) {
                    setChannels(result);
                }
            } catch (error) {
                console.error('Load channels error:', error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        loadChannels();
        return () => { isMounted = false; };
    }, []);

    return { channels, loading };
};
