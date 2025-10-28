// SPDX-License-Identifier: MIT
// Copyright contributors to the kepler.gl project

import document from 'global/document';
import {useCallback, useEffect, useRef, MutableRefObject} from 'react';
export default function useOnClickOutside<T extends HTMLElement>(
  onClose: (e) => void,
  disabled = false,
  ignoreRefs: Array<MutableRefObject<HTMLElement | null>> = []
): MutableRefObject<T | null> {
  const containerRef = useRef<T>(null);
  const handleClickOutside = useCallback(
    e => {
      const isInsideTrigger = ignoreRefs.some(ref => ref.current?.contains(e.target));
      if (containerRef.current && !containerRef.current.contains(e.target) && !isInsideTrigger) {
        onClose(e);
      }
    },
    [ignoreRefs, onClose]
  );

  useEffect(() => {
    if (disabled) {
      return;
    }

    document.addEventListener('click', handleClickOutside, {capture: true});

    return () => {
      document.removeEventListener('click', handleClickOutside, {capture: true});
    };
  }, [handleClickOutside, disabled]);

  return containerRef;
}
