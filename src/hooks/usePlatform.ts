
import { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

export const usePlatform = () => {
  const [isAndroid, setIsAndroid] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    const platform = Capacitor.getPlatform();
    const isNativePlatform = Capacitor.isNativePlatform();
    
    console.log('Capacitor platform:', platform);
    console.log('Is native platform:', isNativePlatform);
    
    setIsAndroid(platform === 'android');
    setIsMobile(['android', 'ios'].includes(platform));
    setIsNative(isNativePlatform);
    
    // Fallback to user agent if needed
    if (!isNativePlatform) {
      const userAgent = navigator.userAgent.toLowerCase();
      const isAndroidDevice = /android/.test(userAgent);
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);
      
      setIsAndroid(isAndroidDevice);
      setIsMobile(isMobileDevice);
    }
  }, []);

  return { isAndroid, isMobile, isNative };
};
