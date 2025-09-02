
import { useState, useEffect } from 'react';

export const usePlatform = () => {
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroidDevice = /android/.test(userAgent);
    const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);
    
    setIsAndroid(isAndroidDevice);
    setIsMobile(isMobileDevice);
  }, []);

  return { isAndroid, isMobile };
};
