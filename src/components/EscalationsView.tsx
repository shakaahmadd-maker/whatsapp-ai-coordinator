import React, { useState } from 'react';
import { CheckCircle2, Clock, Search } from 'lucide-react';
import type { EscalationTicket } from '../types/agent';

interface EscalationsViewProps {
  tickets: EscalationTicket[];
  onToggleTicketStatus: (id: string) => void;
  onReturnToSimulator: () => void;
}

export const EscalationsView: React.FC<EscalationsViewProps> = ({
  tickets,
  onToggleTicketStatus,
  onReturnToSimulator,
}) => {
  const [filter, setFilter] = useState<'all' | 'Pending' | 'Resolved'>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(tickets[0]?.id ?? null);

  const filtered = tickets.filter((t) => {
    const matchesStatus = filter === 'all' || t.status === filter;
    const q = query.trim().toLowerCase();
    const matchesQuery =
      !q ||
      t.reason.toLowerCase().includes(q) ||
      t.clientSummary.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  const activeTicket =
    filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null;

  if (tickets.length === 0) {
    return (
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-10 text-center">
        <h2 className="text-base font-display font-semibold text-slate-900">
          No Human Escalations Yet
        </h2>
        <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">
          When a client requests a live manager, reports a billing dispute, or asks something outside the Verified Knowledge Base, the escalation ticket appears here automatically.
        </p>
        <button
          type="button"
          onClick={onReturnToSimulator}
          className="mt-5 px-4 py-2 text-xs font-medium text-white bg-[#075E54] hover:bg-[#064E46] rounded-lg transition-colors"
        >
          Test Escalation in Simulator
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
          {(['all', 'Pending', 'Resolved'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === tab
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab === 'all' ? 'All Tickets' : tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reason or ticket ID..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700"
          />
        </div>
      </div>

      {/* Table + Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[12px] font-semibold text-slate-600">
                <th className="py-2.5 px-4">Ticket</th>
                <th className="py-2.5 px-4">Trigger Reason</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filtered.map((ticket) => {
                const isSelected = activeTicket?.id === ticket.id;
                return (
                  <tr
                    key={ticket.id}
                    onClick={() => setSelectedId(ticket.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono text-slate-700 tabular-nums whitespace-nowrap">
                      {ticket.id}
                    </td>
                    <td className="py-3 px-4 text-slate-900 font-medium">
                      <p className="truncate max-w-[220px]">{ticket.reason}</p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          ticket.status === 'Pending'
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        }`}
                      >
                        {ticket.status === 'Pending' ? (
                          <Clock className="w-3.5 h-3.5" />
                        ) : (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        )}
                        <span>{ticket.status}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-500 tabular-nums whitespace-nowrap">
                      {ticket.createdAt}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-xs text-slate-500">
                    No matching escalation tickets.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Selected Ticket Transcript */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          {activeTicket ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200">
                <div>
                  <p className="font-mono text-xs text-slate-500 tabular-nums">
                    {activeTicket.id} · {activeTicket.language}
                  </p>
                  <h3 className="text-sm font-display font-semibold text-slate-900 mt-1">
                    {activeTicket.reason}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => onToggleTicketStatus(activeTicket.id)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-800 whitespace-nowrap shrink-0"
                >
                  {activeTicket.status === 'Pending' ? 'Mark Resolved' : 'Reopen'}
                </button>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700 mb-2">
                  Conversation Transcript
                </p>
                <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                  {activeTicket.transcript.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                        <span className="font-semibold text-slate-700">
                          {item.role === 'user'
                            ? 'Client'
                            : item.role === 'human_agent'
                            ? 'Human Coordinator'
                            : 'Assistant'}
                        </span>
                        <span className="tabular-nums">{item.timestamp}</span>
                      </div>
                      <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {item.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Select a ticket to inspect its transcript.</p>
          )}
        </div>
      </div>
    </div>
  );
};
