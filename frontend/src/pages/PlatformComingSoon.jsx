import React from 'react';
import PlatformLayout from '../components/PlatformLayout.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';

/**
 * Placeholder untuk menu admin platform yang sudah muncul di navigasi
 * (lihat PlatformSidebar.jsx, item bertanda `isNew`) tapi belum dibangun
 * penuh. Satu komponen dipakai ulang lewat App.jsx daripada bikin 5 berkas
 * hampir kembar — tinggal ganti route-nya ke halaman sungguhan satu per
 * satu begitu sudah siap, tanpa menyentuh yang lain.
 */
export default function PlatformComingSoon({ title, description, icon }) {
  return (
    <PlatformLayout title={title}>
      <PageHeader eyebrow="Admin Platform" title={title} description={description} />
      <Card>
        <EmptyState
          icon={icon}
          tone="brand"
          title="Segera hadir"
          description="Halaman ini masih dalam pengembangan."
        />
      </Card>
    </PlatformLayout>
  );
}
