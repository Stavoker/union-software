function isBulletBlock(block: string) {
  const lines = block.split("\n").filter((line) => line.trim());
  if (!lines.length) return false;
  return lines.every((line) => /^[-•*]\s/.test(line.trim()));
}

function parseBullets(block: string) {
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-•*]\s+/, ""));
}

type Props = {
  body: string;
};

export function HelpSectionBody({ body }: Props) {
  const blocks = body.split("\n\n").filter((block) => block.trim());

  return (
    <div className="mt-3 space-y-3 text-sm leading-relaxed text-union-muted">
      {blocks.map((block, index) => {
        if (isBulletBlock(block)) {
          return (
            <ul key={index} className="list-disc space-y-1.5 pl-5">
              {parseBullets(block).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}
