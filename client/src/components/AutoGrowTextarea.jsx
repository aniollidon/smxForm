import React, { useLayoutEffect, useRef } from 'react';

// Textarea que creix amb el contingut perquè els comentaris llargs es vegin
// quasi sencers sense haver de fer scroll dins del camp.
export default function AutoGrowTextarea({ value, minRows = 2, style, ...props }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = 'auto';
    const { borderTopWidth, borderBottomWidth } = window.getComputedStyle(node);
    node.style.height = `${node.scrollHeight + parseFloat(borderTopWidth) + parseFloat(borderBottomWidth)}px`;
  }, [value]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={minRows}
      value={value}
      style={{ ...style, overflow: 'hidden' }}
    />
  );
}
