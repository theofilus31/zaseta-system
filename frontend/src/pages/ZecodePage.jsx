import React from 'react';
import Layout from '../components/Layout.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ZecodePanel } from '../components/zecode/ZecodeWidget.jsx';

export default function ZecodePage() {
  return (
    <Layout width="narrow">
      <PageHeader
        title="Zecode AI"
        description="Asisten AI internal — berjalan lokal lewat Ollama di server ini, tidak ada data yang terkirim ke luar."
        className="mb-4"
      />
      <ZecodePanel variant="page" />
    </Layout>
  );
}
