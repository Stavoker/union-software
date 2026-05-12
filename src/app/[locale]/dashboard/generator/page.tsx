import { GeneratorWorkbench } from "@/shared/components/generator/generator-workbench";

export default async function GeneratorPage() {
  return (
    <div className="py-10">
      <div className="mx-auto max-w-6xl">
        <GeneratorWorkbench />
      </div>
    </div>
  );
}
