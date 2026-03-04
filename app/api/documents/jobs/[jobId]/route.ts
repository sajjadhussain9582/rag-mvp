import { getProcessingJob } from '@/lib/rag-db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params
    const job = await getProcessingJob(jobId)
    if (!job) {
      return new Response(
        JSON.stringify({ error: 'Processing job not found' }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' },
        },
      )
    }

    return new Response(JSON.stringify(job), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (error) {
    console.error('Job status error:', error)
    return new Response(
      JSON.stringify({
        error: 'Failed to read job status',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' },
      },
    )
  }
}
