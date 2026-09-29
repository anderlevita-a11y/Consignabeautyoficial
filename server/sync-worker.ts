import { parentPort, workerData } from 'worker_threads';
import { createClient } from '@supabase/supabase-js';
import { runFavoritaSyncOptimized } from './favorita-sync.js';

async function main() {
  if (!parentPort) {
    throw new Error('sync-worker.ts must be started as a worker thread.');
  }

  const { jobId, supabaseUrl, supabaseKey } = workerData || {};

  if (!supabaseUrl || !supabaseKey) {
    parentPort.postMessage({
      type: 'error',
      jobId,
      error: 'Supabase credentials missing in worker thread.'
    });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const result = await runFavoritaSyncOptimized(supabase, (progress) => {
      parentPort?.postMessage({
        type: 'progress',
        jobId,
        data: progress
      });
    });

    parentPort.postMessage({
      type: 'done',
      jobId,
      result
    });
  } catch (err: any) {
    parentPort.postMessage({
      type: 'error',
      jobId,
      error: err.message || 'Worker thread failed execution'
    });
  }
}

main().catch(err => {
  if (parentPort) {
    parentPort.postMessage({
      type: 'error',
      error: err.message
    });
  }
});
