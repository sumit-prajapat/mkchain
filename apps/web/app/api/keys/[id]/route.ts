import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await serviceSupabase
      .from('api_keys')
      .update({ is_active: false })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('id')
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Key not found' }, { status: 404 })
    }

    await serviceSupabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'api_key_revoked',
      metadata: { key_id: params.id },
    })

    return new NextResponse(null, { status: 204 })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
