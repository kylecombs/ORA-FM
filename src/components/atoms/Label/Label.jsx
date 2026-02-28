import './Label.css';

export default function Label({ children, variant = 'default', size = 'md', as: Tag = 'span' }) {
  return (
    <Tag className={`ora-label ora-label--${variant} ora-label--${size}`}>
      {children}
    </Tag>
  );
}
