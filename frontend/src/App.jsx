import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  Plus,
  Store,
  Trash2,
  ExternalLink,
  Loader2,
  ChevronDown,
} from "lucide-react";

import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE;

function App() {
  const [stores, setStores] = useState([]);
  const [name, setName] = useState("");
  const [engine, setEngine] = useState("woocommerce");
  const [loading, setLoading] = useState(false);
  
  // Custom Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const engines = [
    { id: "woocommerce", label: "WooCommerce" },
    { id: "medusa", label: "Medusa" },
  ];

  const fetchStores = async () => {
    try {
      const res = await axios.get(`${API_BASE}/stores`);
      setStores(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchStores();
    const interval = setInterval(fetchStores, 5000);
    
    // Close dropdown when clicking outside
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    
    return () => {
      clearInterval(interval);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/stores`, {
        name,
        type: engine,
      });
      setName("");
      setEngine("woocommerce");
      fetchStores();
    } catch {
      alert("Failed to provision store");
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete store? This cannot be undone.")) return;
    await axios.delete(`${API_BASE}/stores/${id}`);
    fetchStores();
  };

  return (
    <div className="app">
      <div className="container">
        {/* HEADER */}
        <div className="header">
          <h1 className="logo">
            URUMI<span>.AI</span>
          </h1>
          <div className="badge">STORE ORCHESTRATOR</div>
        </div>

        {/* CREATE STORE */}
        <div className="card">
          <h2>Provision New Store</h2>

          <form className="form" onSubmit={handleCreate}>
            <input
              className="input"
              placeholder="Store Name (e.g. Summer Collection)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            {/* CUSTOM MODERN DROPDOWN */}
            <div className="custom-select-container" ref={dropdownRef}>
              <div 
                className={`custom-select ${isDropdownOpen ? 'active' : ''}`}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <span>{engines.find(e => e.id === engine)?.label}</span>
                <ChevronDown size={18} className={`chevron ${isDropdownOpen ? 'rotate' : ''}`} />
              </div>

              {isDropdownOpen && (
                <div className="select-menu">
                  {engines.map((opt) => (
                    <div 
                      key={opt.id}
                      className={`select-item ${engine === opt.id ? 'selected' : ''}`}
                      onClick={() => {
                        setEngine(opt.id);
                        setIsDropdownOpen(false);
                      }}
                    >
                      {opt.label}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button className="button" disabled={loading} type="submit">
              {loading ? (
                <Loader2 size={18} className="spin" />
              ) : (
                <Plus size={18} />
              )}
              Launch
            </button>
          </form>
        </div>

        {/* STORES LIST */}
        <div className="store-grid">
          {stores.length === 0 && !loading && (
            <div className="empty-state">No stores provisioned yet.</div>
          )}

          {stores.map((store) => (
            <div key={store.id} className="store-card">
              <div className="store-left">
                <div className="store-icon">
                  <Store size={20} />
                </div>

                <div>
                  <div className="store-name">{store.name}</div>
                  <div className="store-id">{store.id}</div>
                  <div className="store-type">{store.type}</div>

                  <span
                    className={`status ${
                      store.status?.toLowerCase() === "ready"
                        ? "ready"
                        : store.status?.toLowerCase() === "failed"
                        ? "failed"
                        : "provisioning"
                    }`}
                  >
                    {store.status || "Provisioning"}
                  </span>
                </div>
              </div>

              <div className="actions">
                <a
                  href={store.url}
                  target="_blank"
                  rel="noreferrer"
                  className="icon-btn"
                  title="Open Store"
                >
                  <ExternalLink size={18} />
                </a>

                <button
                  className="icon-btn delete"
                  onClick={() => handleDelete(store.id)}
                  title="Delete Store"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
