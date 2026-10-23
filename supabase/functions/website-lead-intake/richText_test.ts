// Run: npx deno test supabase/functions/website-lead-intake/richText_test.ts
import { assertEquals } from 'jsr:@std/assert@1'
import { htmlToPlainText, labeledLine, plainTextToHtml, sanitizeMessageHtml } from './richText.ts'

Deno.test('keeps the allowlisted tags and drops their attributes', () => {
  assertEquals(
    sanitizeMessageHtml('<p class="x" style="color:red">Hi <strong onclick="a()">there</strong>, <em>really</em> <u>u</u> <b>b</b> <i>i</i></p>'),
    '<p>Hi <strong>there</strong>, <em>really</em> <u>u</u> <b>b</b> <i>i</i></p>',
  )
  assertEquals(sanitizeMessageHtml('<ul><li>One</li><li>Two</li></ul><ol><li>A</li></ol>'), '<ul><li>One</li><li>Two</li></ul><ol><li>A</li></ol>')
  assertEquals(sanitizeMessageHtml('Line one<br/>Line two<br>'), 'Line one<br>Line two<br>')
})

Deno.test('removes scripts, styles and comments with their content', () => {
  assertEquals(sanitizeMessageHtml('<p>ok</p><script>alert(1)</script><style>p{}</style><!-- hidden -->'), '<p>ok</p>')
  assertEquals(sanitizeMessageHtml('<SCRIPT type="x">alert(1)</SCRIPT >after'), 'after')
  assertEquals(sanitizeMessageHtml('<p>a</p><!-- never closed <script>'), '<p>a</p>')
})

Deno.test('strips other tags but keeps their text', () => {
  assertEquals(sanitizeMessageHtml('<div><a href="javascript:alert(1)">click</a> <img src=x onerror=alert(1)>me</div>'), 'click me')
  assertEquals(sanitizeMessageHtml('<h1>Title</h1><span>x</span>'), 'Titlex')
})

Deno.test('cannot be tricked into emitting markup', () => {
  const tricky = [
    '<scr<script>ipt>alert(1)</script>',
    '<<p>p onmouseover=alert(1)>x',
    '<p title="a>b">t</p>',
    '&lt;script&gt;alert(1)&lt;/script&gt;',
    '<img/src=x/onerror=alert(1)>',
    '<p/onclick=alert(1)>x</p>',
    '"><svg onload=alert(1)>',
    '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  ]
  for (const input of tricky) {
    const out = sanitizeMessageHtml(input)
    // Every tag left must be a bare allowlisted tag
    const tags = out.match(/<[^>]*>/g) ?? []
    for (const t of tags) {
      if (!/^<\/?(p|br|strong|b|em|i|u|ul|ol|li)>$/.test(t)) throw new Error(`unexpected tag ${t} from ${input}`)
    }
  }
  assertEquals(sanitizeMessageHtml('&lt;script&gt;alert(1)&lt;/script&gt;'), '&lt;script&gt;alert(1)&lt;/script&gt;')
  assertEquals(sanitizeMessageHtml('<p/onclick=alert(1)>x</p>'), '<p>x</p>')
})

Deno.test('escapes text and normalises entities', () => {
  assertEquals(sanitizeMessageHtml('Tom & Jerry <3 "quotes"'), 'Tom &amp; Jerry &lt;3 &quot;quotes&quot;')
  assertEquals(sanitizeMessageHtml('Caf&eacute; &amp; bar &#39;x&#39; &#x41;'), 'Caf&amp;eacute; &amp; bar &#39;x&#39; A')
})

Deno.test('balances tags and drops stray closers', () => {
  assertEquals(sanitizeMessageHtml('<p><strong>open'), '<p><strong>open</strong></p>')
  assertEquals(sanitizeMessageHtml('text</em></p>more'), 'textmore')
  assertEquals(sanitizeMessageHtml('<li>outside a list</li>'), '<p>outside a list</p>')
})

Deno.test('limits visible text and returns empty when nothing is left', () => {
  assertEquals(sanitizeMessageHtml('<p>abcdef</p><p>ghi</p>', 4), '<p>abcd</p>')
  assertEquals(sanitizeMessageHtml('<p></p><p> <br> </p>'), '')
  assertEquals(sanitizeMessageHtml('<script>only</script>'), '')
})

Deno.test('plain text for emails', () => {
  assertEquals(
    htmlToPlainText('<p>Hello <strong>Maria</strong> &amp; co</p><ul><li>Menu</li><li>Hours</li></ul><p>Bye<br>now</p>'),
    'Hello Maria & co\n\n- Menu\n- Hours\n\nBye\nnow',
  )
})

Deno.test('plain text and labelled lines as rich text', () => {
  assertEquals(plainTextToHtml('One\n\n  Two <b>\r\nThree'), '<p>One</p><p>Two &lt;b&gt;</p><p>Three</p>')
  assertEquals(labeledLine('Email', 'a<b>@x.com'), '<p><strong>Email:</strong> a&lt;b&gt;@x.com</p>')
})
