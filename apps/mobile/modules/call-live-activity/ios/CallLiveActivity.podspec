Pod::Spec.new do |s|
  s.name           = 'CallLiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'ActivityKit bridge for Orbit call Live Activities'
  s.author         = 'Orbit'
  s.homepage       = 'https://github.com/myles-harris/orbit'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
end
