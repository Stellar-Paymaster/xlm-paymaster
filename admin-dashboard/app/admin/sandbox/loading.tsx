import { AdminPageSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <AdminPageSkeleton
      titleWidthClass="w-56"
      rows={4}
      columns={4}
      tableLabel="Loading sandbox telemetry"
      toolbars={1}
    />
  );
}
