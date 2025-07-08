import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const BUCKET_NAME = "nova-videos";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const data = req.body?.data;
  if (!data || !data.videoUrl || !data.title) {
    return res.status(400).json({ error: "Invalid callback payload" });
  }

  const videoUrl = data.videoUrl;
  const title = data.title;
  const filename = `${title}.mp4`;

  try {
    const response = await axios.get(videoUrl, { responseType: "arraybuffer" });
    const videoBuffer = Buffer.from(response.data);

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, videoBuffer, {
        contentType: "video/mp4",
        upsert: true,
      });

    if (uploadError) {
      return res.status(500).json({ error: "Upload to Supabase failed" });
    }

    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${filename}`;
    const match = title.match(/nova-question-(.+)/);
    if (!match) {
      return res.status(400).json({ error: "Malformed title" });
    }

    const questionId = match[1];
    const { error: updateError } = await supabase
      .from("nova_questions")
      .update({ video_question_fr: publicUrl })
      .eq("id", questionId);

    if (updateError) {
      return res.status(500).json({ error: "Failed to update question row" });
    }

    return res.status(200).json({ message: "Callback handled successfully" });

  } catch (err: any) {
    return res.status(500).json({ error: "Callback processing error", details: err.message });
  }
}
