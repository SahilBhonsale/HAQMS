"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

// FIX: This page was completely missing — clicking "View Diagnostic Reports Details (Legacy App)"
// on any patient in the Doctor dashboard returned a 404.
// This implements the missing route: /patients/[id]/history-records
// It fetches the patient record (including appointments) and renders their clinical history.
export default function HistoryRecordsPage() {
  const { id } = useParams();
  const { token, API_BASE_URL } = useAuth();
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setError("Not authenticated");
      setLoading(false);
      return;
    }

    fetch(`${API_BASE_URL}/patients/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch patient record");
        return res.json();
      })
      .then((data) => setPatient(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, token]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">
        Loading records...
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center text-rose-500 text-sm">
        Error: {error}
      </div>
    );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 p-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href="/dashboard"
          className="text-xs text-teal-600 font-bold hover:underline mb-6 block"
        >
          ← Back to Dashboard
        </Link>

        <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-1">
          Diagnostic History Records
        </h1>
        <p className="text-sm text-slate-400 font-semibold mb-8">
          {patient?.name} · Age {patient?.age} · {patient?.gender}
        </p>

        <div className="space-y-4">
          {/* Clinical Background */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Clinical Background
            </h3>
            {/* FIX: Use nullish coalescing to handle null medicalHistory gracefully */}
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-6">
              {patient?.medicalHistory ?? "No medical history on record."}
            </p>
          </div>

          {/* Appointment Records */}
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pt-2">
            Appointment Records
          </h3>

          {patient?.appointments?.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 text-sm">
              No appointment records found for this patient.
            </div>
          ) : (
            patient?.appointments?.map((record) => (
              <div
                key={record.id}
                className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
              >
                <div className="flex justify-between items-start mb-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-extrabold uppercase tracking-wide ${
                      record.status === "COMPLETED"
                        ? "bg-teal-500/10 text-teal-600"
                        : record.status === "CANCELLED"
                        ? "bg-rose-500/10 text-rose-500"
                        : "bg-amber-500/10 text-amber-500"
                    }`}
                  >
                    {record.status}
                  </span>
                  <span className="text-xs text-slate-400 font-semibold">
                    {new Date(record.appointmentDate).toLocaleDateString(
                      "en-US",
                      {
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      }
                    )}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-2">
                  {record.reason || "No reason specified"}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
