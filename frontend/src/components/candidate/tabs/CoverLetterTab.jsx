import DocumentSlot from "../DocumentSlot.jsx";

export default function CoverLetterTab({ coverLetterUrl, uploading, onUpload, onDelete }) {
  return (
    <DocumentSlot url={coverLetterUrl} label="Cover Letter" uploading={uploading} onUpload={onUpload} onDelete={onDelete} />
  );
}
