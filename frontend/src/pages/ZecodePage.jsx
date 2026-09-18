import React from 'react';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ZecodePanel } from '../components/zecode/ZecodeWidget.jsx';
import { useLayoutWidth } from '../context/LayoutWidthContext.jsx';

export default function ZecodePage() {
  useLayoutWidth('narrow');

  return (
    <>
      <PageHeader
        title="Zecode AI"
        description="Asisten AI internal untuk sistem inventaris aset — ditenagai Gemini API."
        className="mb-4"
      />
      <ZecodePanel variant="page" />
    </>
  );
}
