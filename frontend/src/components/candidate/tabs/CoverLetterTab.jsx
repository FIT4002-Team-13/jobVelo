import DocumentSlot from "../DocumentSlot.jsx";

export default function CoverLetterTab({ coverLetterUrl, uploading, onUpload }) {
  return (
    <DocumentSlot url={coverLetterUrl} label="Cover Letter" uploading={uploading} onUpload={onUpload} />
  );
}
