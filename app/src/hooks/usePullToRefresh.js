import { useRef, useEffect, useState } from 'react';

/**
 * Simple pull-to-refresh hook.
 * @param {Function} onRefresh - async function to call on refresh
 * @param {Object} options
 * @param {number} options.threshold - px to pull before triggering (default 72)
 */
export function usePullToRefresh(onRefresh, { threshold = 72 } = {}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current || window;

    const onTouchStart = (e) => {
      const scrollTop = containerRef.current
        ? containerRef.current.scrollTop
        : document.documentElement.scrollTop;
      if (scrollTop > 0) return;
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e) => {
      if (startY.current === null || isRefreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0) {
        setPullDistance(Math.min(delta, threshold * 1.5));
      }
    };

    const onTouchEnd = async () => {
      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        setPullDistance(0);
        await onRefresh();
        setIsRefreshing(false);
      } else {
        setPullDistance(0);
      }
      startY.current = null;
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [pullDistance, isRefreshing, onRefresh, threshold]);

  return { pullDistance, isRefreshing, containerRef };
}