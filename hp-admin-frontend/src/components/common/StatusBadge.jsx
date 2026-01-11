/**
 * Status Badge Component
 * Displays order/event status with appropriate styling
 */

const statusStyles = {
  // Order statuses
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  paid: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
  refunded: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  
  // Event statuses
  draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  active: 'bg-green-500/20 text-green-400 border-green-500/30',
  completed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  
  // Email statuses
  sent: 'bg-green-500/20 text-green-400 border-green-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  processing: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  
  // Default
  default: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

function StatusBadge({ status, className = '' }) {
  const style = statusStyles[status?.toLowerCase()] || statusStyles.default;
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${style} ${className}`}>
      {status || 'Unknown'}
    </span>
  );
}

export default StatusBadge;
