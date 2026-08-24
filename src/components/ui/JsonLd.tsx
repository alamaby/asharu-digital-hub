interface JsonLdProps {
  data: Record<string, unknown>;
}

/** Serializes trusted static data as JSON-LD; `<` is escaped to prevent `</script>` breakouts. */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c')
      }}
    />
  );
}
