import React, { useState, useEffect } from 'react';
import { TopNav } from './components/TopNav';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { BulkUploadView } from './components/BulkUploadView';
import { PurchaseEntryView } from './components/PurchaseEntryView';
import { LedgersView } from './components/LedgersView';
import { GSTValidatorView } from './components/GSTValidatorView';
import { ReconciliationView } from './components/ReconciliationView';
import { AIChatView } from './components/AIChatView';
import { DiagnosticsView } from './components/DiagnosticsView';
import { XMLPreviewModal } from './components/XMLPreviewModal';
import { TallyStatus, LedgerItem, VoucherRecord, VoucherPreview } from './types/accounting';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [status, setStatus] = useState<TallyStatus | null>(null);
  const [ledgers, setLedgers] = useState<LedgerItem[]>([]);
  const [vouchers, setVouchers] = useState<VoucherRecord[]>([]);
  const [sampleInvoices, setSampleInvoices] = useState<any[]>([]);
  const [activePresetInvoice, setActivePresetInvoice] = useState<any>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(false);
  const [isMockMode, setIsMockMode] = useState<boolean>(true);

  // XML Preview Modal
  const [xmlModal, setXmlModal] = useState<{
    isOpen: boolean;
    preview: VoucherPreview | null;
    xml: string;
  }>({
    isOpen: false,
    preview: null,
    xml: '',
  });

  // Fetch Tally status
  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/tally/status');
      const data = await res.json();
      setStatus(data);
      if (data.connected) {
        setIsMockMode(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Fetch Ledgers
  const fetchLedgers = async () => {
    try {
      const res = await fetch('/api/tally/ledgers');
      const data = await res.json();
      if (data.ledgers && data.ledgers.length > 0) {
        setLedgers(data.ledgers);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch Vouchers
  const fetchVouchers = async () => {
    try {
      const res = await fetch('/api/tally/vouchers');
      const data = await res.json();
      if (data.vouchers) {
        setVouchers(data.vouchers);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch sample test invoices
  const fetchSampleInvoices = async () => {
    try {
      const res = await fetch('/api/sample-invoices');
      const data = await res.json();
      if (data.invoices) {
        setSampleInvoices(data.invoices);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchLedgers();
    fetchVouchers();
    fetchSampleInvoices();
  }, []);

  // Load a preset invoice and switch to purchase view
  const handleLoadSampleInvoice = (invoiceId: string) => {
    const target = sampleInvoices.find((i) => i.id === invoiceId);
    if (target) {
      setActivePresetInvoice(target);
      setActiveTab('purchase');
    }
  };

  // Open XML Preview
  const handleOpenXmlPreview = (preview: VoucherPreview, xml: string) => {
    setXmlModal({
      isOpen: true,
      preview,
      xml,
    });
  };

  return (
    <div className="min-h-screen bg-neutral-100/70 text-neutral-900 flex flex-col font-sans">
      <TopNav
        status={status}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onNewVoucher={() => {
          setActivePresetInvoice(null);
          setActiveTab('purchase');
        }}
        isMockMode={isMockMode}
        setIsMockMode={setIsMockMode}
      />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          ledgerCount={ledgers.length}
          voucherCount={vouchers.length}
        />

        <main className="flex-1 p-6 lg:p-8 max-w-5xl overflow-x-hidden">
          {activeTab === 'overview' && (
            <DashboardView
              status={status}
              ledgers={ledgers}
              vouchers={vouchers}
              isLoadingStatus={isLoadingStatus}
              onRefreshStatus={fetchStatus}
              setActiveTab={setActiveTab}
              onLoadSampleInvoice={handleLoadSampleInvoice}
            />
          )}

          {activeTab === 'bulk' && (
            <BulkUploadView
              ledgers={ledgers}
              onOpenXmlPreview={handleOpenXmlPreview}
            />
          )}

          {activeTab === 'purchase' && (
            <PurchaseEntryView
              ledgers={ledgers}
              onOpenXmlPreview={handleOpenXmlPreview}
              presetInvoice={activePresetInvoice}
            />
          )}

          {activeTab === 'ledgers' && (
            <LedgersView
              ledgers={ledgers}
              onSelectLedger={(name) => {
                setActivePresetInvoice((prev: any) => ({ ...prev, supplier_name: name }));
                setActiveTab('purchase');
              }}
            />
          )}

          {activeTab === 'gst' && <GSTValidatorView />}

          {activeTab === 'xml' && (
            <PurchaseEntryView
              ledgers={ledgers}
              onOpenXmlPreview={handleOpenXmlPreview}
              presetInvoice={sampleInvoices[0]}
            />
          )}

          {activeTab === 'reconcile' && <ReconciliationView vouchers={vouchers} />}

          {activeTab === 'ai' && <AIChatView ledgers={ledgers} setActiveTab={setActiveTab} />}

          {activeTab === 'diagnostics' && (
            <DiagnosticsView
              status={status}
              isLoadingStatus={isLoadingStatus}
              onRefreshStatus={fetchStatus}
            />
          )}
        </main>
      </div>

      <XMLPreviewModal
        isOpen={xmlModal.isOpen}
        onClose={() => setXmlModal((prev) => ({ ...prev, isOpen: false }))}
        preview={xmlModal.preview}
        xmlContent={xmlModal.xml}
      />
    </div>
  );
}
