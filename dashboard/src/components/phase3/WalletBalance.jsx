import React, { useState, useEffect, useCallback } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { apiService, getStoredUser } from '../../services/apiService';
import './WalletBalance.css';

/**
 * WalletBalance Component — RouteMate AI
 * High-contrast, theme-aware in-app wallet balance and ledger portal.
 */
export default function WalletBalance() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topupLoading, setTopupLoading] = useState(false);
  const [error, setError] = useState(null);

  const currentUser = getStoredUser();
  const userId = currentUser?.id || 'user_rider_demo';

  const loadWalletData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wRes, txRes] = await Promise.all([
        apiService.getWallet(userId),
        apiService.getWalletTransactions(userId),
      ]);
      setWallet(wRes);
      setTransactions(txRes?.transactions || []);
    } catch (err) {
      setError(err.message || 'Unable to connect to wallet service.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    apiService.getWallet(userId)
      .then((wRes) => {
        if (isMounted) setWallet(wRes);
      })
      .catch((err) => {
        if (isMounted) setError(err.message || 'Unable to connect to wallet service.');
      });

    apiService.getWalletTransactions(userId)
      .then((txRes) => {
        if (isMounted) setTransactions(txRes?.transactions || []);
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [userId]);

  const handleTopup = async (amount) => {
    setTopupLoading(true);
    try {
      await apiService.topupWallet(userId, amount, 'RAZORPAY', `topup_${Date.now()}`);
      await loadWalletData();
    } catch (err) {
      setError(err.message || 'Topup failed.');
    } finally {
      setTopupLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="wallet-page">
        <Card className="error-state">
          <p className="stat-label">Checking wallet balance and ledger...</p>
        </Card>
      </div>
    );
  }

  if (error && !wallet) {
    return (
      <div className="wallet-page">
        <Card className="error-state" elevated>
          <div className="error-icon">⚠️</div>
          <h2>Wallet Unavailable</h2>
          <p>{error}</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Button variant="secondary" onClick={loadWalletData}>
              Retry Connection
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                window.location.hash = '#/ride';
              }}
            >
              Back to Home
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="wallet-page">
      <div className="wallet-page-header">
        <h1>💰 My Wallet</h1>
        <p>In-app balance & verified operational ledger</p>
      </div>

      <Card elevated className="balance-card">
        <div className="balance-header">
          <div>
            <span className="label">Available Balance</span>
            <div className="amount">₹{wallet?.balance?.toFixed(2) || '0.00'}</div>
          </div>
          <span className={`wallet-badge ${wallet?.enabled ? 'wallet-badge-active' : 'wallet-badge-disabled'}`}>
            {wallet?.enabled ? '● Active Ledger' : '○ Not Enabled'}
          </span>
        </div>

        <div className="balance-stats">
          <div className="stat">
            <span className="stat-label">Total Credited</span>
            <span className="stat-value">₹{wallet?.total_credited?.toFixed(2) || '0.00'}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Total Debited</span>
            <span className="stat-value">₹{wallet?.total_debited?.toFixed(2) || '0.00'}</span>
          </div>
        </div>

        <div className="add-money-actions">
          <span className="stat-label">Quick Top Up</span>
          <div className="quick-topup-row">
            <Button
              variant="secondary"
              size="md"
              disabled={topupLoading}
              onClick={() => handleTopup(100)}
            >
              + ₹100
            </Button>
            <Button
              variant="secondary"
              size="md"
              disabled={topupLoading}
              onClick={() => handleTopup(200)}
            >
              + ₹200
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={topupLoading}
              onClick={() => handleTopup(500)}
            >
              + ₹500
            </Button>
          </div>
        </div>
      </Card>

      <Card className="transactions-card">
        <h2>Recent Transactions</h2>
        {transactions && transactions.length > 0 ? (
          <div className="transactions-list">
            {transactions.map((tx) => (
              <div key={tx.id} className="transaction-item">
                <div className="tx-info">
                  <p className="tx-reason">{tx.reason || 'Wallet Activity'}</p>
                  <p className="tx-date">
                    {tx.timestamp ? new Date(tx.timestamp).toLocaleString() : 'Recent'}
                  </p>
                </div>
                <span className={`tx-amount ${tx.type || 'CREDIT'}`}>
                  {tx.type === 'DEBIT' ? '-' : '+'}₹{tx.amount}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
            No wallet transactions yet. Top up funds above to get started.
          </div>
        )}
      </Card>
    </div>
  );
}
