cat << 'CSS' >> css/styles.css

/* Additional Button Styles */
.btn {
    background-color: var(--panel-bg);
    color: var(--text-main);
    border: 1px solid var(--border-color);
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    font-weight: 600;
}
.btn:hover {
    background-color: var(--border-color);
}
.btn.primary, .primary-btn {
    background-color: var(--primary-color);
    color: #fff;
    border-color: var(--primary-color);
}
.btn.primary:hover, .primary-btn:hover {
    background-color: #3b82f6;
}
.btn.warning, .warning-btn {
    background-color: var(--warning-color);
    color: #111;
    border-color: var(--warning-color);
}
.btn.warning:hover, .warning-btn:hover {
    background-color: #d97706;
}
.btn.danger, .danger-btn {
    background-color: var(--danger-color);
    color: #fff;
    border-color: var(--danger-color);
}
.btn.danger:hover, .danger-btn:hover {
    background-color: #dc2626;
}
.btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
CSS
