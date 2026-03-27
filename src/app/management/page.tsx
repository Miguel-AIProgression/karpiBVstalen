"use client";

import { PipelineView } from "@/components/pipeline-view";

export default function ManagementDashboard() {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">Management Overzicht</h2>
      <PipelineView />
      <p className="text-sm text-gray-500">Klant- en prijsbeheer wordt in een volgende fase toegevoegd.</p>
    </div>
  );
}
