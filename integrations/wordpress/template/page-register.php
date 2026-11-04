<?php
/**
 * Template Name: صفحة التسجيل
 *
 * - Saves submission as custom post type (almalki_registration)
 * - Saves to WordPress database + sends admin email notification
 * - On success: opens WhatsApp with pre-filled message (single number for all schools)
 * - CSRF protection via wp_nonce
 *
 * @package Almalki
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

/* ------------------------------------------------------------------ */
/* Single WhatsApp number for all schools                              */
/* ------------------------------------------------------------------ */
define( 'ALMALKI_WA_NUMBER', '920016166' );

/* ------------------------------------------------------------------ */
/* Process form submission (before any output)                         */
/* ------------------------------------------------------------------ */
$success = false;
$error   = '';
$wa_url  = '';

if ( $_SERVER['REQUEST_METHOD'] === 'POST' && isset( $_POST['almalki_register_nonce'] ) ) {

    if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['almalki_register_nonce'] ) ), 'almalki_register_action' ) ) {
        $error = 'حدث خطأ في التحقق الأمني. يرجى المحاولة مرة أخرى.';
    } else {

        $parent_name  = sanitize_text_field( wp_unslash( $_POST['parent_name']   ?? '' ) );
        $phone        = sanitize_text_field( wp_unslash( $_POST['phone']          ?? '' ) );
        $student_name = sanitize_text_field( wp_unslash( $_POST['student_name']  ?? '' ) );
        $grade        = sanitize_text_field( wp_unslash( $_POST['grade']          ?? '' ) );
        $school       = sanitize_text_field( wp_unslash( $_POST['school']         ?? '' ) );
        $email        = sanitize_email(      wp_unslash( $_POST['email']          ?? '' ) );
        $notes        = sanitize_textarea_field( wp_unslash( $_POST['notes']      ?? '' ) );

        /* ---- Spam protection ---- */
        $_spam_data = [
            'student_name' => $student_name,
            'phone'        => $phone,
            'name'         => $parent_name,
            'notes'        => $notes,
        ];
        if ( function_exists('almalki_is_spam') && almalki_is_spam( $_spam_data, 'registration' ) ) {
            // Silent reject — show success to the bot
            $success = true;
            $wa_url  = 'https://wa.me/' . ALMALKI_WA_NUMBER;
        } elseif ( empty( $parent_name ) || empty( $phone ) || empty( $student_name ) || empty( $grade ) || empty( $school ) ) {
            $error = 'يرجى تعبئة جميع الحقول المطلوبة.';
        } elseif ( ! in_array( $grade, array( 'رياض الأطفال', 'الابتدائي', 'المتوسط', 'الثانوي' ), true )
                || ! in_array( $school, wp_list_pluck( almalki_get_schools(), 'short' ), true ) ) {
            /* Rikaz patch: school and stage are checked on the server, not only in the browser */
            $error = 'يرجى اختيار المدرسة والمرحلة من القائمة.';
        } else {

            /* ---- Rikaz patch: duplicate = same student + phone + school + application year (siblings and a new year are allowed) ---- */
            $reg_year = function_exists( 'rikaz_adm_settings' ) ? (string) rikaz_adm_settings()['year'] : '';
            if ( $reg_year === '' ) { $reg_year = wp_date( 'Y' ); }
            $duplicate = get_posts( array(
                'post_type'      => 'almalki_registration',
                'post_status'    => 'publish',
                'posts_per_page' => 1,
                'meta_query'     => array(
                    'relation' => 'AND',
                    array( 'key' => 'reg_student_name', 'value' => $student_name, 'compare' => '=' ),
                    array( 'key' => 'reg_phone',        'value' => $phone,        'compare' => '=' ),
                    array( 'key' => 'reg_school',       'value' => $school,       'compare' => '=' ),
                    array( 'key' => 'reg_year',         'value' => $reg_year,     'compare' => '=' ),
                ),
            ) );

            if ( ! empty( $duplicate ) ) {
                $error = 'تم استلام طلب تسجيل لهذا الطالب مسبقاً. سيتواصل معكم فريقنا قريباً.';
            } else {

            /* ---- Save to WordPress database ---- */
            $post_id = wp_insert_post( array(
                'post_type'   => 'almalki_registration',
                'post_title'  => 'طلب تسجيل: ' . $student_name . ' — ' . wp_date( 'd/m/Y H:i' ),
                'post_status' => 'publish',
                'meta_input'  => array(
                    'reg_parent_name'  => $parent_name,
                    'reg_phone'        => $phone,
                    'reg_student_name' => $student_name,
                    'reg_grade'        => $grade,
                    'reg_school'       => $school,
                    'reg_email'        => $email,
                    'reg_notes'        => $notes,
                    'reg_date'         => current_time( 'mysql' ),
                    'reg_year'         => $reg_year,
                    'reg_ip'           => sanitize_text_field( $_SERVER['REMOTE_ADDR'] ?? '' ),
                ),
            ) );

            if ( $post_id && ! is_wp_error( $post_id ) ) {

                /* ---- Admin email ---- */
                $subject = 'طلب تسجيل جديد — ' . get_bloginfo( 'name' );
                $message = "تم استلام طلب تسجيل جديد عبر الموقع:\n\n"
                         . "اسم ولي الأمر : {$parent_name}\n"
                         . "رقم الجوال    : {$phone}\n"
                         . "اسم الطالب    : {$student_name}\n"
                         . "المرحلة       : {$grade}\n"
                         . "المدرسة       : {$school}\n"
                         . "البريد        : {$email}\n"
                         . "ملاحظات       : {$notes}\n\n"
                         . "لعرض الطلب: " . admin_url( 'post.php?post=' . $post_id . '&action=edit' );
                wp_mail( get_option( 'admin_email' ), $subject, $message, array( 'Content-Type: text/plain; charset=UTF-8' ) );

                /* ---- Confirmation to parent (if email provided) ---- */
                if ( ! empty( $email ) ) {
                    $c_subject = 'تم استلام طلب التسجيل — ' . get_bloginfo( 'name' );
                    $c_message = "السلام عليكم ورحمة الله وبركاته،\n\n"
                               . "عزيزي/عزيزتي {$parent_name}،\n\n"
                               . "تم استلام طلب تسجيل {$student_name} في {$school} بنجاح.\n"
                               . "سيتواصل معك فريقنا في أقرب وقت.\n\n"
                               . "مجموعة المالكي التعليمية\n" . home_url();
                    wp_mail( $email, $c_subject, $c_message, array( 'Content-Type: text/plain; charset=UTF-8' ) );
                }

                /* ---- Build WhatsApp URL ---- */
                $wa_text  = "\u{1F393} *طلب تسجيل جديد — مجموعة المالكي التعليمية*\n\n";
                $wa_text .= "\u{1F4CC} *المدرسة:* {$school}\n";
                $wa_text .= "\u{1F464} *اسم الطالب:* {$student_name}\n";
                $wa_text .= "\u{1F4DA} *المرحلة الدراسية:* {$grade}\n";
                $wa_text .= "\u{1F46A} *اسم ولي الأمر:* {$parent_name}\n";
                $wa_text .= "\u{1F4DE} *رقم التواصل:* {$phone}\n";
                if ( ! empty( $email ) ) {
                    $wa_text .= "\u{1F4E7} *البريد الإلكتروني:* {$email}\n";
                }
                if ( ! empty( $notes ) ) {
                    $wa_text .= "\u{1F4DD} *ملاحظات:* {$notes}\n";
                }
                $wa_text .= "\n_تم الإرسال تلقائياً عبر موقع مجموعة المالكي التعليمية_";
                $wa_url   = 'https://wa.me/' . ALMALKI_WA_NUMBER . '?text=' . rawurlencode( $wa_text );

                $success = true;

            } else {
                $error = 'حدث خطأ أثناء حفظ الطلب. يرجى المحاولة مرة أخرى.';
            }

            } // end: duplicate-check else
        }
    }
}

get_header();
$schools     = almalki_get_schools();
$post_school = $_POST['school'] ?? '';
?>

<section class="page-hero py-5 text-white text-center">
  <div class="container">
    <h1 class="display-4 fw-bolder mb-2">سجل ابنك معنا</h1>
    <p class="lead opacity-90">اختر المدرسة المناسبة وابدأ رحلة تعليمية متميزة</p>
  </div>
</section>

<section class="py-5">
  <div class="container">

    <!-- ===== School Visual Cards (click → selects school) ===== -->
    <div class="row g-3 mb-5" id="school-cards-row">
      <?php foreach ( $schools as $s ) : ?>
        <div class="col-md-6 col-lg-3">
          <div class="school-select-card rounded-4 overflow-hidden shadow-sm position-relative"
               data-school="<?php echo esc_attr( $s['short'] ); ?>"
               onclick="selectSchool(this)"
               style="height:170px;cursor:pointer;border:3px solid transparent;transition:border-color .2s,transform .2s,box-shadow .2s;--school-color:<?php echo esc_attr( $s['color'] ); ?>;">
            <img src="<?php echo esc_url( ALMALKI_URI . '/assets/images/' . $s['image'] ); ?>"
                 class="w-100 h-100" style="object-fit:cover;" alt="<?php echo esc_attr( $s['name'] ); ?>">
            <div class="position-absolute top-0 start-0 w-100 h-100"
                 style="background:<?php echo esc_attr( $s['color'] ); ?>cc;"></div>
            <!-- Check icon (hidden until selected) -->
            <div class="school-check position-absolute top-0 end-0 m-2 bg-white rounded-circle d-flex align-items-center justify-content-center"
                 style="width:28px;height:28px;opacity:0;transition:opacity .2s;">
              <i class="bi bi-check-lg fw-bold" style="color:<?php echo esc_attr( $s['color'] ); ?>;"></i>
            </div>
            <!-- School name overlay -->
            <div class="position-absolute bottom-0 start-0 p-3 text-white w-100">
              <div class="fw-bold" style="text-shadow:0 1px 3px rgba(0,0,0,.6);"><?php echo esc_html( $s['short'] ); ?></div>
              <div style="font-size:.72rem;opacity:.85;text-shadow:0 1px 3px rgba(0,0,0,.5);"><?php echo esc_html( $s['name'] ); ?></div>
            </div>
          </div>
        </div>
      <?php endforeach; ?>
    </div>

    <!-- ===== Registration Form ===== -->
    <div class="bg-white rounded-4 shadow-sm p-4 p-md-5">
      <h2 class="h4 fw-bold mb-1 text-center" style="color:var(--almalki-primary);">نموذج التسجيل</h2>
      <p class="text-center text-muted mb-4 small">
        <i class="bi bi-whatsapp ms-1" style="color:#25d366;"></i>
        سيُحفَظ طلبكم في النظام ويُرسَل مباشرةً عبر واتساب
      </p>

      <?php if ( $success ) : ?>
        <!-- بيانات النجاح للـ JS -->
        <div id="reg-success-trigger"
             data-wa="<?php echo esc_attr( $wa_url ); ?>"
             data-back="<?php echo esc_attr( get_permalink() ); ?>"
             style="display:none;"></div>
      <?php else : ?>

        <?php if ( ! empty( $error ) ) : ?>
          <div class="alert alert-danger rounded-3 mb-4" role="alert">
            <i class="bi bi-exclamation-triangle-fill ms-2"></i>
            <?php echo esc_html( $error ); ?>
          </div>
        <?php endif; ?>

        <form method="POST" action="" id="reg-form" class="row g-3" novalidate>
          <?php wp_nonce_field( 'almalki_register_action', 'almalki_register_nonce' ); ?>
          <!-- Spam honeypot — invisible to real users -->
          <div style="display:none!important;position:absolute;left:-9999px;" aria-hidden="true">
              <input type="text" name="website" tabindex="-1" autocomplete="off" value="">
              <input type="text" name="almalki_hp" tabindex="-1" autocomplete="off" value="">
          </div>

          <!-- Row 1: parent name + phone -->
          <div class="col-md-6">
            <label class="form-label fw-bold">اسم ولي الأمر <span class="text-danger">*</span></label>
            <input type="text" name="parent_name" class="form-control form-control-lg rounded-3"
                   value="<?php echo esc_attr( $_POST['parent_name'] ?? '' ); ?>"
                   placeholder="محمد عبدالله" required>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-bold">رقم الجوال <span class="text-danger">*</span></label>
            <input type="tel" name="phone" class="form-control form-control-lg rounded-3"
                   value="<?php echo esc_attr( $_POST['phone'] ?? '' ); ?>"
                   placeholder="05xxxxxxxx" required>
          </div>

          <!-- Row 2: student name + grade -->
          <div class="col-md-6">
            <label class="form-label fw-bold">اسم الطالب/الطالبة <span class="text-danger">*</span></label>
            <input type="text" name="student_name" class="form-control form-control-lg rounded-3"
                   value="<?php echo esc_attr( $_POST['student_name'] ?? '' ); ?>"
                   placeholder="اسم الطالب كاملاً" required>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-bold">المرحلة الدراسية <span class="text-danger">*</span></label>
            <select name="grade" class="form-select form-select-lg rounded-3" required>
              <option value="">اختر المرحلة...</option>
              <?php foreach ( array( 'رياض الأطفال', 'الابتدائي', 'المتوسط', 'الثانوي' ) as $g ) : ?>
                <option value="<?php echo esc_attr( $g ); ?>"
                  <?php selected( ( $_POST['grade'] ?? '' ), $g ); ?>>
                  <?php echo esc_html( $g ); ?>
                </option>
              <?php endforeach; ?>
            </select>
          </div>

          <!-- Row 3: school SELECT (main form field) + email -->
          <div class="col-md-6">
            <label class="form-label fw-bold">
              المدرسة المرغوبة <span class="text-danger">*</span>
            </label>
            <select name="school" id="school-select" class="form-select form-select-lg rounded-3" required
                    onchange="syncCardFromSelect(this.value)">
              <option value="">— اختر المدرسة —</option>
              <?php foreach ( $schools as $s ) : ?>
                <option value="<?php echo esc_attr( $s['short'] ); ?>"
                  <?php selected( $post_school, $s['short'] ); ?>>
                  <?php echo esc_html( $s['short'] ); ?> — <?php echo esc_html( $s['name'] ); ?>
                </option>
              <?php endforeach; ?>
            </select>
            <div id="school-error" class="invalid-feedback">يرجى اختيار المدرسة.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label fw-bold">البريد الإلكتروني</label>
            <input type="email" name="email" class="form-control form-control-lg rounded-3"
                   value="<?php echo esc_attr( $_POST['email'] ?? '' ); ?>"
                   placeholder="example@email.com">
          </div>

          <!-- Row 4: notes -->
          <div class="col-12">
            <label class="form-label fw-bold">ملاحظات</label>
            <textarea name="notes" class="form-control rounded-3" rows="3"
                      placeholder="أي معلومات إضافية تودّ إضافتها (اختياري)"><?php echo esc_textarea( $_POST['notes'] ?? '' ); ?></textarea>
          </div>

          <!-- Submit -->
          <div class="col-12 text-center mt-2">
            <button type="submit" class="btn btn-lg text-white rounded-pill px-5 fw-bold"
                    style="background:var(--almalki-secondary);min-width:260px;">
              <i class="bi bi-whatsapp ms-2"></i>
              إرسال الطلب عبر واتساب
            </button>
            <p class="text-muted small mt-2 mb-0">
              <i class="bi bi-shield-check ms-1"></i>
              بياناتكم محفوظة ولن تُشارَك مع أي طرف آخر
            </p>
          </div>

        </form>

      <?php endif; ?>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════
     قسم الشروط والمستندات
══════════════════════════════════════════════════════ -->
<section id="reg-conditions" dir="rtl" style="background:linear-gradient(180deg,#f0f4ff 0%,#fff 100%);padding:72px 0 80px;">
  <div class="container">

    <div class="text-center mb-5">
      <span style="font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--almalki-secondary);">قبل التقديم</span>
      <h2 style="font-size:clamp(1.7rem,4vw,2.2rem);font-weight:800;color:var(--almalki-primary);margin:6px 0 4px;">شروط القبول والمستندات المطلوبة</h2>
      <span style="display:block;width:56px;height:4px;background:var(--almalki-secondary);border-radius:4px;margin:10px auto 0;"></span>
    </div>

    <div class="row g-4 mb-5">

      <!-- رياض الأطفال -->
      <div class="col-lg-4 cond-card" data-delay="0">
        <div style="background:#fff;border-radius:20px;padding:28px 24px;height:100%;box-shadow:0 6px 24px rgba(2,48,127,.08);border-top:4px solid #12a86b;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
            <div style="width:46px;height:46px;border-radius:12px;background:#e8f8f1;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="bi bi-flower1" style="font-size:1.4rem;color:#12a86b;"></i>
            </div>
            <h3 style="font-size:1rem;font-weight:700;color:var(--almalki-primary);margin:0;">أولاً: رياض الأطفال</h3>
          </div>
          <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;">
            <li style="display:flex;align-items:flex-start;gap:10px;font-size:.88rem;color:#374151;line-height:1.65;">
              <span style="width:20px;height:20px;border-radius:50%;background:var(--almalki-secondary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.65rem;flex-shrink:0;margin-top:2px;">✓</span>
              أن يكون الطفل في العمر المناسب لمرحلة رياض الأطفال.
            </li>
            <li style="display:flex;align-items:flex-start;gap:10px;font-size:.88rem;color:#374151;line-height:1.65;">
              <span style="width:20px;height:20px;border-radius:50%;background:var(--almalki-secondary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.65rem;flex-shrink:0;margin-top:2px;">✓</span>
              يتم توزيع الأطفال حسب الفئة العمرية المعتمدة لكل مستوى.
            </li>
          </ul>
        </div>
      </div>

      <!-- الصف الأول الابتدائي -->
      <div class="col-lg-4 cond-card" data-delay="120">
        <div style="background:#fff;border-radius:20px;padding:28px 24px;height:100%;box-shadow:0 6px 24px rgba(2,48,127,.08);border-top:4px solid var(--almalki-primary);">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
            <div style="width:46px;height:46px;border-radius:12px;background:#e8eeff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="bi bi-1-circle-fill" style="font-size:1.4rem;color:var(--almalki-primary);"></i>
            </div>
            <h3 style="font-size:1rem;font-weight:700;color:var(--almalki-primary);margin:0;">ثانياً: الصف الأول الابتدائي</h3>
          </div>
          <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;">
            <li style="display:flex;align-items:flex-start;gap:10px;font-size:.88rem;color:#374151;line-height:1.65;">
              <span style="width:20px;height:20px;border-radius:50%;background:var(--almalki-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.65rem;flex-shrink:0;margin-top:2px;">✓</span>
              اجتياز السن النظامي المحدد من وزارة التعليم للالتحاق بالصف الأول الابتدائي.
            </li>
            <li style="display:flex;align-items:flex-start;gap:10px;font-size:.88rem;color:#374151;line-height:1.65;">
              <span style="width:20px;height:20px;border-radius:50%;background:var(--almalki-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:.65rem;flex-shrink:0;margin-top:2px;">✓</span>
              إكمال متطلبات فحص اللياقة البدنية وإكمال التطعيمات النظامية.
            </li>
          </ul>
        </div>
      </div>

      <!-- الشروط العامة -->
      <div class="col-lg-4 cond-card" data-delay="240">
        <div style="background:#fff;border-radius:20px;padding:28px 24px;height:100%;box-shadow:0 6px 24px rgba(2,48,127,.08);border-top:4px solid #c1b678;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;">
            <div style="width:46px;height:46px;border-radius:12px;background:#fdf8e8;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="bi bi-list-check" style="font-size:1.4rem;color:#9a8840;"></i>
            </div>
            <h3 style="font-size:1rem;font-weight:700;color:var(--almalki-primary);margin:0;">ثالثاً: الشروط العامة</h3>
          </div>
          <ul style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:10px;">
            <?php foreach([
              'اجتياز الطالب لاختبارات القبول والمقابلة الشخصية.',
              'توفر مقاعد شاغرة في المرحلة أو الصف المطلوب.',
              'الالتزام بسداد الرسوم الدراسية وفق الجداول المحددة.',
              'تقديم جميع المستندات المطلوبة بشكل كامل وصحيح.',
            ] as $item): ?>
            <li style="display:flex;align-items:flex-start;gap:10px;font-size:.88rem;color:#374151;line-height:1.65;">
              <span style="width:20px;height:20px;border-radius:50%;background:#c1b678;color:#fff;display:flex;align-items:center;justify-content:center;font-size:.65rem;flex-shrink:0;margin-top:2px;">✓</span>
              <?php echo esc_html($item); ?>
            </li>
            <?php endforeach; ?>
          </ul>
        </div>
      </div>

    </div><!-- /row -->

    <!-- المستندات المطلوبة -->
    <div class="cond-card" data-delay="360"
         style="background:#fff;border-radius:22px;padding:36px 32px;box-shadow:0 8px 32px rgba(2,48,127,.09);">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:26px;">
        <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#02307F,#12a86b);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <i class="bi bi-folder2-open" style="font-size:1.5rem;color:#fff;"></i>
        </div>
        <div>
          <h3 style="font-size:1.1rem;font-weight:700;color:var(--almalki-primary);margin:0 0 3px;">المستندات المطلوبة للتسجيل</h3>
          <p style="font-size:.82rem;color:#6b7280;margin:0;">يُرجى تجهيز المستندات التالية كاملةً قبل الحضور</p>
        </div>
      </div>
      <div class="row g-3">
        <?php
        $docs = [
          ['bi-person-vcard-fill',    'الهوية الوطنية / الإقامة',    'صورة من الهوية الوطنية أو الإقامة للطالب وولي الأمر.'],
          ['bi-book-fill',            'سجل العائلة / جواز السفر',    'سجل العائلة للسعوديين، أو جواز السفر لغير السعوديين.'],
          ['bi-file-earmark-person',  'شهادة الميلاد',               'شهادة ميلاد الطالب/الطالبة.'],
          ['bi-clipboard2-pulse-fill','سجل التطعيمات',               'سجل التطعيمات الطبية مكتمل.'],
          ['bi-award-fill',           'الشهادة الدراسية',            'شهادة العام السابق مع كشف الدرجات (الابتدائي فما فوق).'],
          ['bi-heart-pulse-fill',     'تقرير طبي',                   'تقرير يفيد باللياقة الصحية عند الحاجة.'],
          ['bi-camera-fill',          'صور شخصية',                   'أربع صور شخصية حديثة للطالب/الطالبة.'],
          ['bi-bank2',                'مخالصة مالية',                'شهادة انتقال أو مخالصة من المدرسة السابقة عند النقل.'],
        ];
        foreach($docs as $i => $d):
        ?>
        <div class="col-md-6 col-lg-3 doc-item" data-delay="<?php echo 400 + $i*60; ?>">
          <div style="display:flex;align-items:flex-start;gap:11px;padding:14px 16px;background:#f8faff;border-radius:14px;border:1px solid #eaeff8;height:100%;">
            <div style="width:36px;height:36px;border-radius:10px;background:#e8eeff;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="bi <?php echo esc_attr($d[0]); ?>" style="font-size:1rem;color:var(--almalki-primary);"></i>
            </div>
            <div>
              <div style="font-size:.8rem;font-weight:700;color:var(--almalki-primary);margin-bottom:3px;"><?php echo esc_html($d[1]); ?></div>
              <div style="font-size:.77rem;color:#6b7280;line-height:1.55;"><?php echo esc_html($d[2]); ?></div>
            </div>
          </div>
        </div>
        <?php endforeach; ?>
      </div>
    </div>

  </div>
</section>
<!-- /قسم الشروط -->

<!-- ══════════════════════════════════════════════════════
     SUCCESS MODAL
══════════════════════════════════════════════════════ -->
<div id="reg-success-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" dir="rtl"
     style="display:none;position:fixed;inset:0;z-index:99999;align-items:center;justify-content:center;padding:16px;">
  <!-- Backdrop -->
  <div id="modal-backdrop"
       style="position:absolute;inset:0;background:rgba(1,18,50,.72);backdrop-filter:blur(6px);opacity:0;transition:opacity .4s ease;"></div>
  <!-- Panel -->
  <div id="modal-panel"
       style="position:relative;z-index:2;background:#fff;border-radius:24px;width:100%;max-width:620px;max-height:90vh;overflow-y:auto;box-shadow:0 32px 80px rgba(0,0,0,.3);opacity:0;transform:scale(.88) translateY(30px);transition:opacity .45s cubic-bezier(.34,1.56,.64,1),transform .45s cubic-bezier(.34,1.56,.64,1);">

    <!-- Header stripe -->
    <div style="background:linear-gradient(135deg,#02307F 0%,#12a86b 100%);border-radius:24px 24px 0 0;padding:32px 28px 28px;text-align:center;position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='0.06'%3E%3Cpath d='M20 0L0 20h20V0zm0 40V20H0l20 20zM40 0H20v20L40 0zm0 40L20 20v20h20z'/%3E%3C/g%3E%3C/svg%3E\");"></div>
      <!-- Animated checkmark -->
      <div id="modal-check"
           style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.18);border:3px solid rgba(255,255,255,.5);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;transform:scale(0);transition:transform .5s cubic-bezier(.34,1.56,.64,1) .3s;">
        <i class="bi bi-check-lg" style="font-size:2.4rem;color:#fff;"></i>
      </div>
      <h2 id="modal-title" style="color:#fff;font-size:1.5rem;font-weight:800;margin:0 0 6px;position:relative;">🎉 تم التسجيل بنجاح!</h2>
      <p style="color:rgba(255,255,255,.88);font-size:.92rem;margin:0;position:relative;">تم حفظ طلبكم في النظام وسيتواصل معكم فريقنا قريباً</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 28px 24px;">

      <!-- Steps -->
      <h3 style="font-size:.95rem;font-weight:700;color:var(--almalki-primary);margin:0 0 16px;display:flex;align-items:center;gap:8px;">
        <i class="bi bi-signpost-2-fill" style="color:var(--almalki-secondary);"></i>
        الخطوات التالية بعد التسجيل
      </h3>
      <ol style="list-style:none;padding:0;margin:0 0 24px;display:flex;flex-direction:column;gap:10px;">
        <?php
        $steps = [
          'تعبئة نموذج التسجيل الإلكتروني أو الحضور لمقر المدرسة للحصول على النموذج الورقي.',
          'تحديد موعد لإجراء المقابلة الشخصية واختبار القبول للطالب.',
          'سداد الرسوم الدراسية خلال الفترة المحددة لتأكيد حجز المقعد.',
          'تقديم جميع المستندات المطلوبة بشكل كامل وصحيح إلى القسم.',
          'استكمال بقية الإجراءات الإدارية، واستلام جدول الحصص والكتب الدراسية.',
        ];
        foreach($steps as $n => $step):
        ?>
        <li class="modal-step" data-step="<?php echo $n; ?>"
            style="display:flex;align-items:flex-start;gap:12px;background:#f8faff;border-radius:12px;padding:12px 14px;opacity:0;transform:translateX(20px);">
          <div style="width:28px;height:28px;border-radius:50%;background:var(--almalki-primary);color:#fff;font-size:.8rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <?php echo $n+1; ?>
          </div>
          <span style="font-size:.88rem;color:#374151;line-height:1.65;"><?php echo esc_html($step); ?></span>
        </li>
        <?php endforeach; ?>
      </ol>

      <!-- WA hint -->
      <div style="background:#e9faf2;border:1.5px solid rgba(18,168,107,.3);border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px;margin-bottom:22px;">
        <i class="bi bi-whatsapp" style="font-size:1.8rem;color:#25d366;flex-shrink:0;"></i>
        <div>
          <div style="font-size:.88rem;font-weight:700;color:#1a7a4a;">جاري فتح واتساب تلقائياً…</div>
          <div style="font-size:.78rem;color:#6b7280;">إذا لم يفتح، اضغط على الزر أدناه</div>
        </div>
      </div>

      <!-- Buttons -->
      <div style="display:flex;flex-direction:column;gap:10px;">
        <a id="modal-wa-btn" href="#" target="_blank" rel="noopener"
           style="display:flex;align-items:center;justify-content:center;gap:8px;background:#25d366;color:#fff;font-size:1rem;font-weight:700;padding:14px 24px;border-radius:50px;text-decoration:none;transition:background .2s;"
           onmouseover="this.style.background='#1da851'" onmouseout="this.style.background='#25d366'">
          <i class="bi bi-whatsapp" style="font-size:1.2rem;"></i>
          فتح المحادثة على واتساب
        </a>
        <a id="modal-new-btn" href="#"
           style="display:flex;align-items:center;justify-content:center;gap:8px;background:#f0f4ff;color:var(--almalki-primary);font-size:.92rem;font-weight:600;padding:12px 24px;border-radius:50px;text-decoration:none;border:1.5px solid #d0daf5;transition:background .2s;"
           onmouseover="this.style.background='#e0e8ff'" onmouseout="this.style.background='#f0f4ff'">
          <i class="bi bi-person-plus-fill"></i>
          تسجيل طالب آخر
        </a>
      </div>

    </div>
  </div>
</div>

<style>
/* condition cards animation */
.cond-card, .doc-item {
  opacity: 0;
  transform: translateY(24px);
}
.cond-card.revealed, .doc-item.revealed {
  opacity: 1;
  transform: translateY(0);
  transition: opacity .5s ease, transform .5s cubic-bezier(.34,1.56,.64,1);
}
</style>

<style>
.school-select-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 28px rgba(0,0,0,.22) !important;
}
.school-select-card.selected {
  border-color: var(--school-color) !important;
  transform: translateY(-4px);
  box-shadow: 0 10px 28px rgba(0,0,0,.22) !important;
}
.school-select-card.selected .school-check { opacity: 1 !important; }
</style>

<script>
/* ══ SUCCESS MODAL ══════════════════════════════════════════ */
(function(){
  var trigger = document.getElementById('reg-success-trigger');
  if (!trigger) return;

  var waUrl   = trigger.dataset.wa;
  var backUrl = trigger.dataset.back;
  var modal   = document.getElementById('reg-success-modal');
  var bd      = document.getElementById('modal-backdrop');
  var panel   = document.getElementById('modal-panel');
  var check   = document.getElementById('modal-check');
  var waBtn   = document.getElementById('modal-wa-btn');
  var newBtn  = document.getElementById('modal-new-btn');

  if(waBtn)  waBtn.href  = waUrl;
  if(newBtn) newBtn.href = backUrl;

  /* Show modal */
  function openModal(){
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    // Trigger reflow then animate
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        bd.style.opacity    = '1';
        panel.style.opacity = '1';
        panel.style.transform = 'scale(1) translateY(0)';
        // Animate check after panel settles
        setTimeout(function(){ check.style.transform = 'scale(1)'; }, 350);
        // Stagger steps
        document.querySelectorAll('.modal-step').forEach(function(el){
          var n = parseInt(el.dataset.step, 10);
          setTimeout(function(){
            el.style.transition = 'opacity .4s ease, transform .4s cubic-bezier(.34,1.56,.64,1)';
            el.style.opacity    = '1';
            el.style.transform  = 'translateX(0)';
          }, 550 + n * 100);
        });
        // Auto-open WhatsApp after 2s
        setTimeout(function(){
          window.open(waUrl, '_blank', 'noopener');
        }, 2000);
      });
    });
  }

  /* Run after a short delay so page paints first */
  setTimeout(openModal, 300);
})();

/* ══ SCROLL ANIMATIONS (conditions) ═══════════════════════ */
(function(){
  if(!('IntersectionObserver' in window)){
    document.querySelectorAll('.cond-card,.doc-item')
      .forEach(function(el){ el.classList.add('revealed'); });
    return;
  }
  var obs = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(!entry.isIntersecting) return;
      var d = parseInt(entry.target.dataset.delay,10)||0;
      setTimeout(function(){ entry.target.classList.add('revealed'); }, d);
      obs.unobserve(entry.target);
    });
  },{ threshold:0.08 });
  document.querySelectorAll('.cond-card,.doc-item')
    .forEach(function(el){ obs.observe(el); });
})();

/* ── EXISTING SCRIPTS ── */
/* ---- Sync card → select ---- */
function selectSchool(card) {
  document.querySelectorAll('.school-select-card').forEach(function (c) {
    c.classList.remove('selected');
  });
  card.classList.add('selected');

  var schoolVal = card.dataset.school;
  var sel = document.getElementById('school-select');
  if (sel) {
    sel.value = schoolVal;
    sel.classList.remove('is-invalid');
  }

  /* scroll to form */
  var form = document.getElementById('reg-form');
  if (form) { form.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

/* ---- Sync select → card ---- */
function syncCardFromSelect(val) {
  document.querySelectorAll('.school-select-card').forEach(function (c) {
    c.classList.toggle('selected', c.dataset.school === val);
  });
}

/* ---- On load: highlight pre-selected (after POST error) ---- */
(function () {
  var sel = document.getElementById('school-select');
  if (sel && sel.value) { syncCardFromSelect(sel.value); }

  /* Form submit validation */
  var form = document.getElementById('reg-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      var sel2 = document.getElementById('school-select');
      if (sel2 && !sel2.value) {
        e.preventDefault();
        sel2.classList.add('is-invalid');
        document.getElementById('school-cards-row').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
})();
</script>

<?php get_footer(); ?>
